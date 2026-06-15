export type BoostcampAuthMode = 'emailPassword' | 'token' | 'sessionCookie';

export interface BoostcampCredentialsData {
	authMode: BoostcampAuthMode;
	email?: string;
	password?: string;
	token?: string;
	sessionCookie?: string;
	apiBaseUrl?: string;
}

export interface BoostcampIssue {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

export interface BoostcampWorkoutSet {
	setIndex: number;
	setType: 'warmup' | 'working' | 'drop' | 'failure' | 'amrap' | 'unknown';
	completed: boolean;
	isWarmup: boolean;
	isFailure: boolean;
	weightKg?: number;
	reps?: number;
	targetReps?: number;
	rpe?: number;
	rir?: number;
	restSeconds?: number;
	volumeKg?: number;
	notes?: string;
}

export interface BoostcampExercise {
	id?: string;
	name: string;
	normalizedName: string;
	category?: string;
	equipment?: string;
	order: number;
	notes?: string;
	sets: BoostcampWorkoutSet[];
}

export interface BoostcampSession {
	id: string;
	date: string;
	endedAt?: string;
	timezone: string;
	title?: string;
	program?: string;
	week?: number;
	day?: number;
	exercises: BoostcampExercise[];
}

export interface BoostcampSummary {
	sessions: number;
	exercises: number;
	totalSets: number;
	workingSets: number;
	totalVolumeKg: number;
}

export interface BoostcampPeriod {
	startDate: string;
	endDate: string;
	timezone: string;
}

export interface BoostcampWorkoutsResult {
	source: 'boostcamp';
	period?: BoostcampPeriod;
	account?: {
		id?: string;
		name?: string;
		displayName?: string;
		email?: string;
		weightUnit?: string;
	};
	sessions: BoostcampSession[];
	summary: BoostcampSummary;
	warnings: BoostcampIssue[];
	raw: unknown | null;
}
