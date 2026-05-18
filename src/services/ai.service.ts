interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AIResponse {
    text: string;
    token_count: number;
    is_crisis: boolean;
}

export class AIService {
    private crisis_keywords = [
        'suicide', 'kill myself', 'end my life', 'want to die',
        'self harm', 'hurt myself', 'no reason to live'
    ];

    /**
     * Get AI response (Mock for development)
     * In production, this will call Claude API
     */
    async getChatResponse(
        message: string,
        _conversation_history: ChatMessage[] = [],
        _patient_context?: any
    ): Promise<AIResponse> {
        // Check for crisis keywords
        const is_crisis = this.detectCrisis(message);

        // Mock response based on development mode
        if (process.env.NODE_ENV === 'development') {
            return this.getMockResponse(message, is_crisis);
        }

        // TODO: Implement real Claude API call
        // return await this.getClaudeResponse(message, conversation_history, patient_context);
        
        return this.getMockResponse(message, is_crisis);
    } 

    /**
     * Detect crisis keywords in message
     */
    private detectCrisis(message: string): boolean {
        const lower_message = message.toLowerCase();
        return this.crisis_keywords.some(keyword => lower_message.includes(keyword));
    }

    /**
     * Mock AI response for development
     */
    private getMockResponse(message: string, is_crisis: boolean): AIResponse {
        if (is_crisis) {
            return {
                text: `I'm very concerned about what you've shared. Your safety is the top priority. Please reach out to the 988 Suicide & Crisis Lifeline immediately by calling or texting 988. They have trained Assistants available 24/7. I also strongly encourage you to contact your Doctor right away. You don't have to face this alone - help is available.`,
                token_count: 75,
                is_crisis: true
            };
        }

        // Generate contextual mock responses
        const responses = this.getContextualResponses(message);
        const selected_response = responses[Math.floor(Math.random() * responses.length)];

        return {
            text: selected_response,
            token_count: Math.floor(selected_response.split(' ').length * 1.3), // Approximate token count
            is_crisis: false
        };
    }

    /**
     * Get contextual mock responses based on message content
     */
    private getContextualResponses(message: string): string[] {
        const lower_message = message.toLowerCase();

        // Anxiety-related
        if (lower_message.includes('anxious') || lower_message.includes('anxiety') || lower_message.includes('worried')) {
            return [
                "I hear that you're feeling anxious. Anxiety is a natural response, but it can feel overwhelming. Have you tried any breathing exercises today? Sometimes taking a few deep breaths can help ground us in the present moment.",
                "It sounds like anxiety is weighing on you right now. Remember, it's okay to feel this way. What specific thoughts or situations are triggering these feelings? Understanding the source can be the first step toward managing it.",
                "Anxiety can be really challenging. One technique that many find helpful is the 5-4-3-2-1 grounding method: name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, and 1 you taste. Would you like to try this together?"
            ];
        }

        // Stress-related
        if (lower_message.includes('stress') || lower_message.includes('overwhelmed') || lower_message.includes('pressure')) {
            return [
                "It sounds like you're dealing with a lot of stress right now. Remember, it's important to take things one step at a time. What's the most pressing thing on your mind today?",
                "Feeling overwhelmed is completely valid. Sometimes breaking tasks into smaller, manageable pieces can help. What's one small thing you could do today to ease some of that pressure?",
                "Stress can really take a toll on us. Have you had a chance to do something for yourself today? Even a short walk or a few minutes of quiet time can make a difference."
            ];
        }

        // Sleep-related
        if (lower_message.includes('sleep') || lower_message.includes('tired') || lower_message.includes('insomnia')) {
            return [
                "Sleep difficulties can really affect how we feel during the day. Have you noticed any patterns in what might be disrupting your sleep? Sometimes identifying triggers can help us address them.",
                "Getting quality rest is so important for our mental health. Creating a calming bedtime routine can really help. What does your evening routine look like right now?",
                "I understand sleep issues can be frustrating. Have you tried any relaxation techniques before bed, like progressive muscle relaxation or guided meditation?"
            ];
        }

        // Mood/Depression-related
        if (lower_message.includes('sad') || lower_message.includes('depressed') || lower_message.includes('down') || lower_message.includes('hopeless')) {
            return [
                "I'm sorry you're feeling this way. It takes courage to acknowledge these feelings. Remember that what you're experiencing is valid, and you don't have to go through this alone. Have you been able to talk to your Doctor about how you've been feeling?",
                "Feeling down can make everything seem harder. Even small steps count - have you been able to do any of your wellness activities today? Sometimes gentle movement or journaling can help shift our perspective a bit.",
                "Thank you for sharing how you're feeling. Depression can make it hard to see the positives, but you're taking an important step by reaching out. What's one thing, even something small, that brought you a moment of peace recently?"
            ];
        }

        // Relationship-related
        if (lower_message.includes('relationship') || lower_message.includes('friend') || lower_message.includes('family') || lower_message.includes('partner')) {
            return [
                "Relationships can be complex and challenging. It sounds like this is weighing on you. What aspect of this relationship is most difficult for you right now?",
                "Navigating relationships requires patience and understanding - both for others and ourselves. Have you been able to communicate your feelings to the person involved?",
                "It's natural for relationships to have ups and downs. What matters most is how we handle those moments. What would healthy communication look like in this situation for you?"
            ];
        }

        // Progress/Positive
        if (lower_message.includes('better') || lower_message.includes('good') || lower_message.includes('progress') || lower_message.includes('happy')) {
            return [
                "That's wonderful to hear! It's important to acknowledge and celebrate these positive moments. What do you think contributed to feeling this way?",
                "I'm so glad you're experiencing some positive feelings. These moments are valuable - they remind us that change is possible. How can you build on this momentum?",
                "It's great that you're noticing improvements! Progress isn't always linear, but recognizing these positive shifts is an important part of the journey. What's been most helpful for you?"
            ];
        }

        // Gratitude/Reflection
        if (lower_message.includes('grateful') || lower_message.includes('thankful') || lower_message.includes('appreciate')) {
            return [
                "Practicing gratitude is such a powerful tool for Clinic. It's beautiful that you're taking time to notice the positive things in your life. What else are you grateful for today?",
                "That's a wonderful perspective. Gratitude can really shift our mindset. How does focusing on these positive aspects make you feel?",
                "Thank you for sharing that. Recognizing what we're grateful for, even in challenging times, can be incredibly grounding. How might you carry this feeling forward?"
            ];
        }

        // Default responses
        return [
            "Thank you for sharing that with me. I'm here to listen and support you. Can you tell me more about what's on your mind?",
            "I appreciate you opening up. It sounds like you're working through some important thoughts and feelings. What would be most helpful for you to explore right now?",
            "I hear you. Sometimes just expressing what we're feeling can be a relief. How are you taking care of yourself today?",
            "That's an important thing to reflect on. Clinic is a journey, and every step counts. What's one thing you'd like to focus on moving forward?",
            "Thank you for trusting me with your thoughts. Remember, you're not alone in this. Your Doctor and I are here to support you. What feels most important to address right now?"
        ];
    }

    /**
     * Count tokens (approximate)
     */
    countTokens(text: string): number {
        // Rough approximation: 1 token ≈ 0.75 words
        const words = text.split(/\s+/).length;
        return Math.ceil(words * 1.3);
    }

    /**
     * TODO: Implement real Claude API call
     * Uncomment when ready to integrate Claude
     */
    // private async getClaudeResponse(
    //     message: string,
    //     conversation_history: ChatMessage[],
    //     patient_context?: any
    // ): Promise<AIResponse> {
    //     // This will be implemented when integrating real Claude API
    //     // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
    //     // const system_prompt = this.buildSystemPrompt(patient_context);
    //     // const messages = this.formatConversationHistory(conversation_history, message);
        
    //     // const response = await anthropic.messages.create({
    //     //     model: 'claude-sonnet-4-20250514',
    //     //     max_tokens: 800,
    //     //     temperature: 0.7,
    //     //     system: system_prompt,
    //     //     messages: messages
    //     // });
        
    //     // return {
    //     //     text: response.content[0].text,
    //     //     token_count: response.usage.output_tokens,
    //     //     is_crisis: this.detectCrisis(response.content[0].text)
    //     // };

    //     throw new Error('Claude API not implemented yet');
    // }

    /**
     * Build system prompt for Claude (for future implementation)
     */
    // private buildSystemPrompt(patient_context?: any): string {
    //     return `You are a compassionate Clinic assistant for the Apothecary platform.

    // Patient reference: ${patient_context?.patient_id || 'unknown'}

    // Guidelines:
    // - Warm, non-judgmental, evidence-based tone
    // - Always recommend consulting their Doctor for clinical decisions
    // - If patient expresses crisis or self-harm intent: immediately provide 988 Suicide & Crisis Lifeline
    //   and urge them to contact their Doctor
    // - Do not make clinical diagnoses
    // - Focus on supportive listening and gentle guidance
    // - Encourage healthy coping strategies and self-care

    // Remember: You are a supportive tool, not a replacement for professional Clinical Care.`;
    // }
}

export const aiService = new AIService();
