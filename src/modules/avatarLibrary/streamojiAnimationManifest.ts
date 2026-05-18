export type StreamojiAvatarGender = 'male' | 'female';
export type StreamojiAnimationCategory = 'Idle' | 'Dance' | 'Locomotion' | 'Expression';

export type StreamojiAnimationManifestEntry = {
    id: string;
    aliases?: string[];
    name: string;
    category: StreamojiAnimationCategory;
    avatarGender: StreamojiAvatarGender;
    fileName: string;
    sourceUrl: string;
};

type AnimationDefinition = {
    id: string;
    aliases?: string[];
    name: string;
    category: StreamojiAnimationCategory;
    path: string;
};

const SOURCE_BASE_URL = 'https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev';

const definitions: AnimationDefinition[] = [
    { id: 'm_idle_01', name: 'Idle 1', category: 'Idle', path: 'idle/M_Standing_Idle_001.glb' },
    { id: 'm_idle_02', name: 'Idle 2', category: 'Idle', path: 'idle/M_Standing_Idle_002.glb' },
    ...Array.from({ length: 10 }, (_, index) => {
        const number = String(index + 1).padStart(2, '0');
        const fileNumber = String(index + 1).padStart(3, '0');
        return {
            id: `m_idle_var_${number}`,
            aliases: [`m_idle_var_${index + 1}`],
            name: `Idle Var ${index + 1}`,
            category: 'Idle' as const,
            path: `idle/M_Standing_Idle_Variations_${fileNumber}.glb`
        };
    }),
    { id: 'f_idle_01', name: 'Soft Idle 1', category: 'Idle', path: 'idle/F_Standing_Idle_001.glb' },
    ...Array.from({ length: 9 }, (_, index) => {
        const number = String(index + 1).padStart(2, '0');
        const fileNumber = String(index + 1).padStart(3, '0');
        return {
            id: `f_idle_var_${number}`,
            aliases: [`f_idle_var_${index + 1}`],
            name: `Soft Var ${index + 1}`,
            category: 'Idle' as const,
            path: `idle/F_Standing_Idle_Variations_${fileNumber}.glb`
        };
    }),
    ...[
        ['m_dance_01', 'Power Beat', 'dance/M_Dances_001.glb'],
        ['m_dance_02', 'Power Bounce', 'dance/M_Dances_002.glb'],
        ['m_dance_03', 'Drip Move', 'dance/M_Dances_003.glb'],
        ['m_dance_04', 'Heart Eyes Move', 'dance/M_Dances_004.glb'],
        ['m_dance_05', 'Pump It', 'dance/M_Dances_005.glb'],
        ['m_dance_06', 'Twist', 'dance/M_Dances_006.glb'],
        ['m_dance_07', 'Sprint Move', 'dance/M_Dances_007.glb'],
        ['m_dance_08', 'Mass Groove', 'dance/M_Dances_008.glb'],
        ['m_dance_09', 'Pump It Dance', 'dance/M_Dances_009.glb'],
        ['m_dance_11', 'Swag Move', 'dance/M_Dances_011.glb'],
        ['f_dance_01', 'Spin Vibe', 'dance/F_Dances_001.glb'],
        ['f_dance_04', 'Side Bounce', 'dance/F_Dances_004.glb'],
        ['f_dance_05', 'Cheer Dance', 'dance/F_Dances_005.glb'],
        ['f_dance_06', 'Dhoom Dance', 'dance/F_Dances_006.glb'],
        ['f_dance_07', 'Backward Jump', 'dance/F_Dances_007.glb']
    ].map(([id, name, path]) => ({ id, name, path, category: 'Dance' as const })),
    ...[
        ['m_walk_01', 'Casual Walk', 'locomotion/M_Walk_001.glb'],
        ['m_walk_02', 'Confident Walk', 'locomotion/M_Walk_002.glb'],
        ['m_run_01', 'Sprint Run', 'locomotion/M_Run_001.glb'],
        ['m_jog_01', 'Light Jog', 'locomotion/M_Jog_001.glb'],
        ['m_jog_03', 'Steady Jog', 'locomotion/M_Jog_003.glb'],
        ['m_walk_back', 'Backwards Walk', 'locomotion/M_Walk_Backwards_001.glb'],
        ['m_run_back', 'Backwards Run', 'locomotion/M_Run_Backwards_002.glb'],
        ['m_jog_back', 'Backwards Jog', 'locomotion/M_Jog_Backwards_001.glb'],
        ['m_walk_jump_1', 'Walk Hop', 'locomotion/M_Walk_Jump_001.glb'],
        ['m_walk_jump_2', 'Walk Leap', 'locomotion/M_Walk_Jump_002.glb'],
        ['m_walk_jump_3', 'Walk Hurdle', 'locomotion/M_Walk_Jump_003.glb'],
        ['m_run_jump_1', 'Run Jump', 'locomotion/M_Run_Jump_001.glb'],
        ['m_run_jump_2', 'Sprint Leap', 'locomotion/M_Run_Jump_002.glb'],
        ['m_jog_jump_1', 'Jog Hop', 'locomotion/M_Jog_Jump_001.glb'],
        ['m_jog_jump_2', 'Jog Skips', 'locomotion/M_Jog_Jump_002.glb'],
        ['f_walk_02', 'Elegant Walk', 'locomotion/F_Walk_002.glb'],
        ['f_walk_03', 'Catwalk', 'locomotion/F_Walk_003.glb'],
        ['f_run_01', 'Light Run', 'locomotion/F_Run_001.glb'],
        ['f_jog_01', 'Easy Jog', 'locomotion/F_Jog_001.glb'],
        ['f_walk_strafe_l', 'Side Step Left', 'locomotion/F_Walk_Strafe_Left_001.glb'],
        ['f_walk_strafe_r', 'Side Step Right', 'locomotion/F_Walk_Strafe_Right_001.glb'],
        ['m_walk_strafe_l', 'Strafe Left', 'locomotion/M_Walk_Strafe_Left_002.glb'],
        ['m_walk_strafe_r', 'Strafe Right', 'locomotion/M_Walk_Strafe_Right_002.glb'],
        ['m_crouch', 'Stealth Walk', 'locomotion/M_Crouch_Walk_003.glb'],
        ['f_crouch', 'Low Sneak', 'locomotion/F_Crouch_Walk_001.glb']
    ].map(([id, name, path]) => ({ id, name, path, category: 'Locomotion' as const })),
    ...[
        ['m_expr_01', 'Friendly Wave', 'expression/M_Standing_Expressions_001.glb'],
        ['m_expr_02', 'You There', 'expression/M_Standing_Expressions_002.glb'],
        ['m_expr_04', 'Awkward Agreement', 'expression/M_Standing_Expressions_004.glb'],
        ['m_expr_05', "What's Going On?", 'expression/M_Standing_Expressions_005.glb'],
        ['m_expr_06', 'Tired Stretch', 'expression/M_Standing_Expressions_006.glb'],
        ['m_expr_07', 'Concealed Laughter', 'expression/M_Standing_Expressions_007.glb'],
        ['m_expr_08', 'You Come Here', 'expression/M_Standing_Expressions_008.glb'],
        ['m_expr_09', 'Come Here Kid', 'expression/M_Standing_Expressions_009.glb'],
        ['m_expr_10', 'Come Here Everyone', 'expression/M_Standing_Expressions_010.glb'],
        ['m_expr_11', 'No Freaking Way', 'expression/M_Standing_Expressions_011.glb'],
        ['m_expr_12', 'Cheerful Approval', 'expression/M_Standing_Expressions_012.glb'],
        ['m_expr_13', 'Waving Hello', 'expression/M_Standing_Expressions_013.glb'],
        ['m_expr_14', 'Checking Surroundings', 'expression/M_Standing_Expressions_014.glb'],
        ['m_expr_15', 'Referee Warning', 'expression/M_Standing_Expressions_015.glb'],
        ['m_expr_16', 'You Thumbs Down', 'expression/M_Standing_Expressions_016.glb'],
        ['m_expr_17', 'Side Thumbs Down', 'expression/M_Standing_Expressions_017.glb'],
        ['m_expr_18', "You're Finished", 'expression/M_Standing_Expressions_018.glb'],
        ['m_talk_01', 'Oh God, Why Me?', 'expression/M_Talking_Variations_001.glb'],
        ['m_talk_02', 'What Are You Doing?', 'expression/M_Talking_Variations_002.glb'],
        ['m_talk_03', 'What Am I Doing?', 'expression/M_Talking_Variations_003.glb'],
        ['m_talk_04', 'No Way', 'expression/M_Talking_Variations_004.glb'],
        ['m_talk_05', "What's Going On?", 'expression/M_Talking_Variations_005.glb'],
        ['m_talk_06', 'I Have No Idea', 'expression/M_Talking_Variations_006.glb'],
        ['m_talk_07', "What's Going On Here?", 'expression/M_Talking_Variations_007.glb'],
        ['m_talk_08', "Let's Stop", 'expression/M_Talking_Variations_008.glb'],
        ['m_talk_09', 'Fed Up Moment', 'expression/M_Talking_Variations_009.glb'],
        ['m_talk_10', "What's This? Hold On", 'expression/M_Talking_Variations_010.glb'],
        ['f_talk_01', 'Great Job Clap', 'expression/F_Talking_Variations_001.glb'],
        ['f_talk_02', 'Chill Stretch', 'expression/F_Talking_Variations_002.glb'],
        ['f_talk_03', 'This Is Me', 'expression/F_Talking_Variations_003.glb'],
        ['f_talk_04', 'Empathize', 'expression/F_Talking_Variations_004.glb'],
        ['f_talk_05', 'Loose Hands Stretch', 'expression/F_Talking_Variations_005.glb'],
        ['f_talk_06', 'Take It Easy', 'expression/F_Talking_Variations_006.glb']
    ].map(([id, name, path]) => ({ id, name, path, category: 'Expression' as const }))
];

export function normalizeAvatarGender(value?: string | null): StreamojiAvatarGender {
    return value?.toLowerCase() === 'female' ? 'female' : 'male';
}

export function buildStreamojiAnimationManifest(): StreamojiAnimationManifestEntry[] {
    return (['male', 'female'] as const).flatMap((avatarGender) => {
        const folder = avatarGender === 'female' ? 'femenine' : 'masculine';

        return definitions.map((animation) => ({
            ...animation,
            avatarGender,
            fileName: `${avatarGender}/${animation.path.split('/').pop()}`,
            sourceUrl: `${SOURCE_BASE_URL}/${folder}/${animation.path}`
        }));
    });
}
