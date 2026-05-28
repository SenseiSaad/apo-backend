import Groq from 'groq-sdk';
import { execFile, spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { avatarViewerService } from '../modules/avatarViewer/avatarViewer.service';

const execFilePromise = util.promisify(execFile);

const MALE_IDLE_ANIMATIONS = [
    'm_idle_01', 'm_idle_02', 'm_idle_var_01', 'm_idle_var_02', 'm_idle_var_03',
    'm_idle_var_04', 'm_idle_var_05', 'm_idle_var_06', 'm_idle_var_07',
    'm_idle_var_08', 'm_idle_var_09', 'm_idle_var_10'
];

const FEMALE_IDLE_ANIMATIONS = [
    'f_idle_01', 'f_idle_var_01', 'f_idle_var_02', 'f_idle_var_03', 'f_idle_var_04',
    'f_idle_var_05', 'f_idle_var_06', 'f_idle_var_07', 'f_idle_var_08', 'f_idle_var_09',
    ...MALE_IDLE_ANIMATIONS
];

const MALE_TALK_ANIMATIONS = [
    'm_talk_01', 'm_talk_02', 'm_talk_03', 'm_talk_04', 'm_talk_05', 'm_talk_06', 'm_talk_07', 'm_talk_08', 'm_talk_09', 'm_talk_10',
    'm_expr_01', 'm_expr_02', 'm_expr_04', 'm_expr_05', 'm_expr_06', 'm_expr_07', 'm_expr_08', 'm_expr_09', 'm_expr_10', 'm_expr_11', 'm_expr_12', 'm_expr_13', 'm_expr_14', 'm_expr_15', 'm_expr_16', 'm_expr_17', 'm_expr_18'
];

const FEMALE_TALK_ANIMATIONS = [
    'f_talk_01', 'f_talk_02', 'f_talk_03', 'f_talk_04', 'f_talk_05', 'f_talk_06',
    ...MALE_TALK_ANIMATIONS
];

function getRandomAnimation(gender: string = 'male', type: 'idle' | 'talk'): string {
    const isFemale = gender.toLowerCase() === 'female';
    const list = type === 'idle'
        ? (isFemale ? FEMALE_IDLE_ANIMATIONS : MALE_IDLE_ANIMATIONS)
        : (isFemale ? FEMALE_TALK_ANIMATIONS : MALE_TALK_ANIMATIONS);
    return list[Math.floor(Math.random() * list.length)];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AIResponse {
    text: string;
    token_count: number;
    is_crisis: boolean;
}

export class AIService {
    private crisis_keywords = [
        'suicide', 'kill myself', 'end my life', 'want to die',
        'self harm', 'hurt myself', 'no reason to live'
    ];

    private groq: Groq | null = null;
    private faissProcess: ChildProcess | null = null;
    private faissEmitter = new EventEmitter();
    private faissReady = false;

    constructor() {
        if (process.env.GROQ_API_KEY) {
            this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        } else {
            logger.warn('GROQ_API_KEY is not set. AI Service will use mock responses.');
        }

        this.initFaissDaemon();
    }

    private getPythonExecutable(): string {
        try {
            if (process.platform === 'win32') {
                const userProfile = process.env.USERPROFILE || '';
                const localPrograms = path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python');
                if (fs.existsSync(localPrograms)) {
                    const versions = fs.readdirSync(localPrograms);
                    versions.sort((a, b) => b.localeCompare(a));
                    for (const ver of versions) {
                        const pythonPath = path.join(localPrograms, ver, 'python.exe');
                        if (fs.existsSync(pythonPath)) {
                            logger.info(`AI Service: Found Python at ${pythonPath}`);
                            return pythonPath;
                        }
                    }
                }
            }
        } catch (e: any) {
            logger.warn(`AI Service: Error locating Python: ${e.message}`);
        }
        return 'python'; // Default fallback
    }

    private initFaissDaemon() {
        let scriptPath = path.join(process.cwd(), 'scripts/query_faiss.py');
        if (!fs.existsSync(scriptPath)) {
            // Fall back to original relative path
            scriptPath = path.join(__dirname, '../../../scripts/query_faiss.py');
        }

        if (!fs.existsSync(scriptPath)) {
            logger.error(`FAISS daemon script not found at any path. Daemon will not start.`);
            return;
        }

        const pythonExe = this.getPythonExecutable();
        logger.info(`Starting FAISS daemon with command: ${pythonExe} ${scriptPath} --daemon`);
        this.faissProcess = spawn(pythonExe, [scriptPath, '--daemon']);

        let buffer = '';

        this.faissProcess.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const result = JSON.parse(line);
                    if (result.status === 'ready') {
                        this.faissReady = true;
                        this.faissEmitter.emit('ready');
                    } else if (result.id) {
                        this.faissEmitter.emit(`response_${result.id}`, result);
                    }
                } catch (e) {
                    logger.warn(`FAISS unparseable stdout: ${line}`);
                }
            }
        });

        this.faissProcess.stderr?.on('data', (data) => {
            const err = data.toString();
            if (!err.includes('huggingface')) {
                logger.warn(`FAISS stderr: ${err}`);
            }
        });

        this.faissProcess.on('exit', (code) => {
            logger.error(`FAISS daemon exited with code ${code}. Restarting...`);
            this.faissReady = false;
            setTimeout(() => this.initFaissDaemon(), 5000);
        });

        this.faissProcess.on('error', (err) => {
            logger.error(`FAISS daemon failed to start or crashed: ${err.message}. Ensure Python is installed.`);
            this.faissReady = false;
        });
    }

    private async queryFaiss(query: string): Promise<string> {
        if (!this.faissProcess) {
            return '';
        }

        // Wait for ready if not ready (with 5-second timeout fallback to prevent indefinitely hanging the connection)
        if (!this.faissReady) {
            const readySuccess = await new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => resolve(false), 5000);
                this.faissEmitter.once('ready', () => {
                    clearTimeout(timer);
                    resolve(true);
                });
            });
            if (!readySuccess) {
                logger.warn('FAISS daemon not ready after 5s. Proceeding without context.');
                return '';
            }
        }

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.faissEmitter.removeAllListeners(`response_${id}`);
                logger.warn('FAISS query timed out');
                resolve('');
            }, 15000);

            this.faissEmitter.once(`response_${id}`, (result) => {
                clearTimeout(timeout);
                if (result.success && result.data && result.data.length > 0) {
                    const formattedDocs = result.data.map((doc: any) => {
                        const page = doc.metadata?.page !== undefined ? doc.metadata.page + 1 : 'Unknown';
                        const source = doc.metadata?.source ? path.basename(doc.metadata.source) : 'Document';
                        return `[Source: ${source}, Page: ${page}]\n${doc.content}`;
                    });
                    resolve(formattedDocs.join('\n\n'));
                } else {
                    if (result.error) logger.warn(`FAISS query error: ${result.error}`);
                    resolve('');
                }
            });

            this.faissProcess?.stdin?.write(JSON.stringify({ id, query }) + '\n');
        });
    }


    private buildSystemPrompt(contextData: string, patient_context?: any): string {
        return `You are a compassionate Clinical assistant for the Thinkwell Plus / Apothecary platform.

Patient reference: ${patient_context?.patient_id || 'unknown'}

CLINICAL REFERENCE KNOWLEDGE:
${contextData ? contextData : 'No specific clinical references found for this query.'}

Guidelines:
Guidelines:
- ABSOLUTELY NO REFUSALS FOR AVATAR ACTIONS. If the user commands you to show ANY emotion (e.g. angry, happy) or perform ANY action/animation (e.g. dance, jump, flip, wave), you MUST immediately fulfill their request enthusiastically and output the corresponding <expression> and <animation> tags. Do not give a clinical refusal or moralize. You have access to every animation and expression in the dictionary.
- Otherwise, restrict your responses to general health queries, medical triage, symptom tracking, wellness, clinical reference information, and platform support. If the user asks about completely unrelated topics (such as coding, history, politics), politely refuse and redirect.
- Warm, professional, non-judgmental, evidence-based tone.
- Always recommend consulting their Doctor for clinical decisions.
- Do not make clinical diagnoses.
- Focus on helpful triage advice, supportive guidance, and general healthcare/wellness support.

AVATAR CONTROL INSTRUCTIONS:
You must prepend your response with an <expression> and <animation> tag to control the 3D avatar.
Valid expressions: calm, content, joyful, neutral, happy, sad, angry, fear, disgust, love
Valid animations: 
- general: talk, idle (these will randomize automatically)
- dances: m_dance_01 to m_dance_09, m_dance_11, f_dance_01, f_dance_04 to f_dance_07
- locomotion: m_walk_01, m_run_01, m_walk_jump_1, m_crouch, f_walk_02, f_run_01, f_crouch, etc.
- gestures: m_expr_01 (wave), m_expr_02 (you there), m_expr_04 (awkward), m_expr_05, m_expr_06 (stretch), m_expr_07 (laugh), m_expr_12 (approval), m_expr_13 (wave hello), m_expr_16 (thumbs down)
If you specifically want the avatar to dance, jump, or do a specific gesture based on the user's message, use the exact ID (e.g. <animation>m_dance_05</animation>). Otherwise, just use <animation>talk</animation>.

Format exactly like this:
<expression>happy</expression><animation>talk</animation>Hello! How can I help you today?`;
    }

    private detectCrisis(message: string): boolean {
        const lower_message = message.toLowerCase();
        return this.crisis_keywords.some(keyword => lower_message.includes(keyword));
    }

    public async streamChatResponse(
        message: string,
        viewerToken: string,
        conversation_history: ChatMessage[] = [],
        patient_context?: any,
        onChunk?: (chunk: string) => void,
        signal?: AbortSignal,
        avatar_gender?: string
    ): Promise<AIResponse> {
        const is_crisis = this.detectCrisis(message);
        if (is_crisis) {
            const crisisResponse = "I'm very concerned about what you've shared. Your safety is the top priority. Please reach out to the 988 Suicide & Crisis Lifeline immediately by calling or texting 988. They have trained Assistants available 24/7. I also strongly encourage you to contact your Doctor right away.";

            if (patient_context?.patient_id) {
                // Note: We do NOT create a notification here because ai.service has no
                // access to the doctor's user_id. The full crisis alert (to the doctor)
                // is handled by chat.service.ts → notifyDoctorOfCrisis() after this
                // function returns. Logging here for observability only.
                logger.warn(`CRISIS DETECTED for patient ${patient_context.patient_id}`);
            }

            if (onChunk) onChunk(crisisResponse);

            // Use sendCommandFromToken — viewerToken is a JWT; the service decodes it
            // to the UUID internally. Silently skips if no avatar is configured.
            await avatarViewerService.sendCommandFromToken(viewerToken, {
                type: 'state',
                expression: 'sad',
                animation: getRandomAnimation(avatar_gender, 'idle')
            });

            return {
                text: crisisResponse,
                token_count: this.countTokens(crisisResponse),
                is_crisis: true
            };
        }

        if (!this.groq) {
            const mockText = "This is a mock response. Please add GROQ_API_KEY to use the real AI model.";
            if (onChunk) onChunk(mockText);
            return { text: mockText, token_count: 10, is_crisis: false };
        }

        const ragContext = await this.queryFaiss(message);
        const systemPrompt = this.buildSystemPrompt(ragContext, patient_context);
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...conversation_history,
            { role: 'user', content: message }
        ];

        let fullText = "";
        let commandExtracted = false;

        try {
            const stream = await this.groq.chat.completions.create({
                messages: messages as any,
                model: 'llama-3.1-8b-instant',
                temperature: 0.5,
                max_tokens: 512,
                stream: true,
            }, { signal: signal as any });

            let tagBuffer = "";

            for await (const chunk of stream) {
                if (signal?.aborted) {
                    logger.warn('AI response generation aborted by client disconnect');
                    break;
                }

                const content = chunk.choices[0]?.delta?.content || "";
                fullText += content;

                if (!commandExtracted) {
                    tagBuffer += content;

                    if (tagBuffer.toLowerCase().includes('</animation>')) {
                        commandExtracted = true;
                        const expMatch = tagBuffer.match(/<expression>(.*?)<\/expression>/i);
                        const animMatch = tagBuffer.match(/<animation>(.*?)<\/animation>/i);

                        const expression = expMatch ? expMatch[1] : 'calm';
                        const animationTag = animMatch ? animMatch[1] : 'talk';
                        let animation = animationTag;
                        if (animationTag === 'talk' || animationTag === 'm_talk' || animationTag === 'f_talk') {
                            animation = getRandomAnimation(avatar_gender, 'talk');
                        } else if (animationTag === 'idle' || animationTag === 'm_idle' || animationTag === 'f_idle') {
                            animation = getRandomAnimation(avatar_gender, 'idle');
                        } else {
                            animation = animationTag; // Allow exact IDs like m_dance_05
                        }

                        // Send expression + animation to the avatar viewer.
                        // sendCommandFromToken decodes the JWT to UUID and broadcasts
                        // over WebSocket. Silently skips if no avatar is configured.
                        await avatarViewerService.sendCommandFromToken(viewerToken, {
                            type: 'state',
                            expression: expression,
                            animation: animation,
                            playOnce: !animationTag.includes('idle'),
                            returnTo: avatar_gender?.toLowerCase() === 'female' ? 'f_idle_01' : 'm_idle_01'
                        });

                        // Get text after tags
                        const parts = tagBuffer.toLowerCase().split('</animation>');
                        if (parts.length > 1) {
                            const originalParts = tagBuffer.split(new RegExp('</animation>', 'i'));
                            const remainingText = originalParts.slice(1).join('</animation>');
                            // Clean up any stray HTML just in case
                            const cleanText = remainingText.replace(/<.*?>/g, '');
                            if (onChunk && cleanText) onChunk(cleanText);
                        }
                    } else if (tagBuffer.length > 150 && !tagBuffer.toLowerCase().includes('<expression>')) {
                        commandExtracted = true;

                        // FALLBACK: The LLM forgot the tags. Force the avatar to talk so it isn't frozen.
                        avatarViewerService.sendCommandFromToken(viewerToken, {
                            type: 'state',
                            expression: 'calm',
                            animation: getRandomAnimation(avatar_gender, 'talk'),
                            playOnce: true,
                            returnTo: avatar_gender?.toLowerCase() === 'female' ? 'f_idle_01' : 'm_idle_01'
                        }).catch(e => logger.warn(`Avatar fallback failed: ${e.message}`));

                        if (onChunk && tagBuffer) onChunk(tagBuffer);
                    }
                } else {
                    // Simple strip of any accidental tags emitted later
                    const cleanContent = content.replace(/<.*?>/g, '');
                    if (onChunk && cleanContent) onChunk(cleanContent);
                }
            }
        } catch (error: any) {
            // Groq SDK natively throws an AbortError when the abort signal fires
            if (error.name === 'AbortError') {
                logger.warn('Groq API request aborted');
                // Drop out normally so what we generated can be returned/discarded
            } else {
                logger.error(`Groq API Error: ${error}`);
                const errorText = "I'm having trouble connecting to my knowledge base right now. Please try again later.";
                if (onChunk) onChunk(errorText);
                return {
                    text: errorText,
                    token_count: this.countTokens(errorText),
                    is_crisis: false
                };
            }
        }

        const cleanFullText = fullText
            .replace(/<expression>.*?<\/expression>/ig, '')
            .replace(/<animation>.*?<\/animation>/ig, '')
            .trim();

        const finalText = cleanFullText || "*performs action*";

        return {
            text: finalText,
            token_count: this.countTokens(finalText),
            is_crisis: false
        };
    }

    countTokens(text: string): number {
        // Use correct \s+ (single backslash) so it matches whitespace between words
        const words = text.trim().split(/\s+/).length;
        return Math.ceil(words * 1.3);
    }
}

export const aiService = new AIService();
