import type {
	BoostcampIssue,
	BoostcampSession,
	BoostcampSummary,
	BoostcampWorkoutSet,
} from './boostcamp.types';

interface NormalizeOptions {
	startDate: string;
	endDate: string;
	timezone: string;
	weightUnit?: string;
	normalize: boolean;
}

export function normalizeTrainingHistory(
	historyData: unknown,
	options: NormalizeOptions,
): {
	sessions: BoostcampSession[];
	summary: BoostcampSummary;
	warnings: BoostcampIssue[];
	filteredRaw: Record<string, unknown[]>;
} {
	const warnings: BoostcampIssue[] = [];
	const filteredRaw: Record<string, unknown[]> = {};
	const sessions: BoostcampSession[] = [];
	const summary: BoostcampSummary = {
		sessions: 0,
		exercises: 0,
		totalSets: 0,
		workingSets: 0,
		totalVolumeKg: 0,
	};

	if (!historyData || typeof historyData !== 'object') {
		warnings.push({
			code: 'BOOSTCAMP_PARTIAL_DATA',
			message: 'Boostcamp history payload was not an object.',
		});
		return { sessions, summary, warnings, filteredRaw };
	}

	const unitDecision = resolveWeightUnit(options.weightUnit, historyData);
	if (unitDecision.assumed) {
		warnings.push({
			code: 'BOOSTCAMP_UNIT_CONVERSION_ASSUMED',
			message: 'Boostcamp weight looked like lb-equivalent data and was converted to kg.',
		});
	}

	const entries = Object.entries(historyData as Record<string, unknown>).sort(([left], [right]) =>
		left.localeCompare(right),
	);

	for (const [dateKey, rawSessions] of entries) {
		if (!isWithinDateRange(dateKey, options.startDate, options.endDate, options.timezone)) {
			continue;
		}

		if (!Array.isArray(rawSessions)) {
			warnings.push({
				code: 'BOOSTCAMP_PARTIAL_DATA',
				message: `Expected an array of sessions for date ${dateKey}.`,
			});
			continue;
		}

		filteredRaw[dateKey] = rawSessions;
		for (const [index, rawSession] of rawSessions.entries()) {
			if (!rawSession || typeof rawSession !== 'object') {
				warnings.push({
					code: 'BOOSTCAMP_PARTIAL_DATA',
					message: `Skipped malformed session on ${dateKey}.`,
				});
				continue;
			}

			const normalized = normalizeSession(
				rawSession as Record<string, unknown>,
				dateKey,
				index,
				unitDecision.unit,
				options.timezone,
				options.normalize,
				warnings,
			);
			if (!normalized) {
				continue;
			}

			sessions.push(normalized);
			summary.sessions += 1;
			summary.exercises += normalized.exercises.length;

			for (const exercise of normalized.exercises) {
				for (const set of exercise.sets) {
					summary.totalSets += 1;
					if (set.completed && !set.isWarmup) {
						summary.workingSets += 1;
					}
					summary.totalVolumeKg += set.volumeKg ?? 0;
				}
			}
		}
	}

	summary.totalVolumeKg = roundNumber(summary.totalVolumeKg);

	if (sessions.length === 0) {
		warnings.push({
			code: 'BOOSTCAMP_NO_WORKOUTS_FOUND',
			message: 'No Boostcamp workouts were found for the requested period.',
		});
	}

	return { sessions, summary, warnings, filteredRaw };
}

export function buildWorkoutsResult(params: {
	startDate: string;
	endDate: string;
	timezone: string;
	sessions: BoostcampSession[];
	summary: BoostcampSummary;
	warnings: BoostcampIssue[];
	errors?: BoostcampIssue[];
	raw?: unknown;
}) {
	return {
		ok: (params.errors?.length ?? 0) === 0,
		source: 'boostcamp' as const,
		period: {
			startDate: params.startDate,
			endDate: params.endDate,
			timezone: params.timezone,
		},
		sessions: params.sessions,
		summary: params.summary,
		warnings: params.warnings,
		errors: params.errors ?? [],
		raw: params.raw ?? null,
	};
}

export function validateDateRange(startDate: string, endDate: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDate)) {
		throw new Error('Dates must use the YYYY-MM-DD format.');
	}

	if (startDate > endDate) {
		throw new Error('Start date must be before or equal to end date.');
	}
}

export function getTimezoneOffsetMinutes(timezone: string, referenceDate: Date) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
	const parts = formatter
		.formatToParts(referenceDate)
		.filter((part) => part.type !== 'literal')
		.reduce<Record<string, string>>((accumulator, part) => {
			accumulator[part.type] = part.value;
			return accumulator;
		}, {});

	const utcMillis = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
	);

	return Math.round((utcMillis - referenceDate.getTime()) / 60000);
}

function normalizeSession(
	rawSession: Record<string, unknown>,
	dateKey: string,
	sessionIndex: number,
	weightUnit: 'kg' | 'lb',
	timezone: string,
	normalizeNames: boolean,
	warnings: BoostcampIssue[],
) {
	const rawRecords = Array.isArray(rawSession.records)
		? rawSession.records
		: Array.isArray(rawSession.exercises)
			? rawSession.exercises
			: [];

	const exercises = rawRecords
		.map((rawExercise, exerciseIndex) =>
			normalizeExercise(
				rawExercise,
				exerciseIndex,
				weightUnit,
				normalizeNames,
				warnings,
			),
		)
		.filter(isDefined);

	const session: BoostcampSession = {
		id: asString(rawSession.id) ?? `${dateKey}:${sessionIndex}`,
		date: toIsoDate(dateKey, timezone),
		endedAt: asString(rawSession.endedAt) ?? asString(rawSession.ended_at),
		timezone,
		title: asString(rawSession.name) ?? asString(rawSession.title),
		program:
			asString(rawSession.program) ??
			asString(rawSession.programName) ??
			asString(rawSession.program_name),
		week: asOptionalNumber(rawSession.week),
		day: asOptionalNumber(rawSession.day),
		exercises,
	};
	return session;
}

function normalizeExercise(
	rawExercise: unknown,
	order: number,
	weightUnit: 'kg' | 'lb',
	normalizeNames: boolean,
	warnings: BoostcampIssue[],
) {
	if (!rawExercise || typeof rawExercise !== 'object') {
		warnings.push({
			code: 'BOOSTCAMP_UNKNOWN_EXERCISE_FORMAT',
			message: 'Skipped an exercise with an unexpected shape.',
		});
		return null;
	}

	const exercise = rawExercise as Record<string, unknown>;
	const rawName = asString(exercise.name) ?? asString(exercise.title);
	const rawSets = Array.isArray(exercise.sets) ? exercise.sets : [];

	if (!rawName && rawSets.length === 0) {
		warnings.push({
			code: 'BOOSTCAMP_UNKNOWN_EXERCISE_FORMAT',
			message: 'Skipped an exercise without a name or sets.',
		});
		return null;
	}

	const sets = rawSets
		.map((rawSet, setIndex) => normalizeSet(rawSet, setIndex, weightUnit))
		.filter(isDefined);

	return {
		id: asString(exercise.id),
		name: rawName ?? 'Unknown Exercise',
		normalizedName: normalizeNames ? normalizeExerciseName(rawName ?? 'Unknown Exercise') : rawName ?? 'Unknown Exercise',
		category: asString(exercise.category),
		equipment: asString(exercise.equipment),
		order,
		notes: asString(exercise.notes) ?? asString(exercise.note),
		sets,
	};
}

function normalizeSet(rawSet: unknown, setIndex: number, weightUnit: 'kg' | 'lb') {
	if (!rawSet || typeof rawSet !== 'object') {
		return null;
	}

	const set = rawSet as Record<string, unknown>;
	const reps = asOptionalNumber(set.archived_reps) ?? asOptionalNumber(set.reps);
	const rawWeight = asOptionalNumber(set.archived_weight) ?? asOptionalNumber(set.weight);
	const weightKg = rawWeight === undefined ? undefined : convertWeightToKg(rawWeight, weightUnit);
	const isWarmup =
		asOptionalBoolean(set.isWarmup) ??
		asOptionalBoolean(set.is_warmup) ??
		(asString(set.type)?.toLowerCase() === 'warmup');
	const isFailure =
		asOptionalBoolean(set.isFailure) ??
		asOptionalBoolean(set.is_failure) ??
		(asString(set.type)?.toLowerCase() === 'failure');
	const setType = inferSetType(set, isWarmup, isFailure);
	const completed =
		!(asOptionalBoolean(set.skipped) ?? false) &&
		(reps !== undefined || rawWeight !== undefined || asOptionalNumber(set.target) !== undefined);
	const volumeKg =
		reps !== undefined && weightKg !== undefined ? roundNumber(reps * weightKg) : undefined;

	return {
		setIndex,
		setType,
		completed,
		isWarmup,
		isFailure,
		weightKg,
		reps,
		targetReps: resolveTargetReps(set),
		rpe: asOptionalNumber(set.archived_rpe) ?? asOptionalNumber(set.rpe),
		rir: asOptionalNumber(set.archived_rir) ?? asOptionalNumber(set.rir),
		restSeconds: asOptionalNumber(set.rest_seconds) ?? asOptionalNumber(set.restSeconds),
		volumeKg,
		notes: asString(set.notes) ?? asString(set.note),
	};
}

function inferSetType(
	set: Record<string, unknown>,
	isWarmup: boolean,
	isFailure: boolean,
): BoostcampWorkoutSet['setType'] {
	if (isWarmup) {
		return 'warmup';
	}

	const explicitType = asString(set.setType) ?? asString(set.set_type) ?? asString(set.type);
	switch (explicitType?.toLowerCase()) {
		case 'warmup':
			return 'warmup';
		case 'drop':
		case 'dropset':
			return 'drop';
		case 'failure':
			return 'failure';
	}

	if (isFailure) {
		return 'failure';
	}

	const targetType = asString(set.target_type)?.toUpperCase();
	if (targetType === 'AMRAP') {
		return 'amrap';
	}

	if (targetType) {
		return 'working';
	}

	return 'unknown';
}

function resolveTargetReps(set: Record<string, unknown>) {
	const targetType = asString(set.target_type);
	const target = asOptionalNumber(set.target);
	const targetMax = asOptionalNumber(set.target_max);

	switch (targetType) {
		case 'reps':
		case 'reps_max':
		case 'reps_progression':
			return target;
		case 'reps_range':
			return targetMax ?? target;
		default:
			return undefined;
	}
}

function normalizeExerciseName(name: string) {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/\((.*?)\)/g, '$1');
}

function resolveWeightUnit(weightUnit: string | undefined, historyData: unknown) {
	const explicitUnit = weightUnit?.trim().toLowerCase();
	if (explicitUnit === 'lb' || explicitUnit === 'lbs' || explicitUnit === 'pounds') {
		return { unit: 'lb' as const, assumed: false };
	}

	if (explicitUnit === 'kg' || explicitUnit === 'kgs' || explicitUnit === 'kilograms') {
		return { unit: 'kg' as const, assumed: false };
	}

	const samples = collectWeightSamples(historyData);
	const looksLikePounds = samples.length > 0 && samples.filter((value) => value >= 135).length / samples.length >= 0.6;

	return {
		unit: looksLikePounds ? ('lb' as const) : ('kg' as const),
		assumed: looksLikePounds,
	};
}

function collectWeightSamples(historyData: unknown) {
	if (!historyData || typeof historyData !== 'object') {
		return [];
	}

	const samples: number[] = [];
	for (const sessions of Object.values(historyData as Record<string, unknown>)) {
		if (!Array.isArray(sessions)) {
			continue;
		}

		for (const session of sessions) {
			const records = Array.isArray((session as Record<string, unknown>)?.records)
				? ((session as Record<string, unknown>).records as unknown[])
				: [];
			for (const record of records) {
				const sets = Array.isArray((record as Record<string, unknown>)?.sets)
					? ((record as Record<string, unknown>).sets as unknown[])
					: [];
				for (const set of sets) {
					const weight = asOptionalNumber((set as Record<string, unknown>).archived_weight);
					if (weight && weight > 0) {
						samples.push(weight);
					}
				}
			}
		}
	}

	return samples.slice(0, 100);
}

function convertWeightToKg(weight: number, unit: 'kg' | 'lb') {
	return roundNumber(unit === 'lb' ? weight * 0.45359237 : weight);
}

function isWithinDateRange(dateKey: string, startDate: string, endDate: string, timezone: string) {
	const normalized = toIsoDate(dateKey, timezone);
	return normalized >= startDate && normalized <= endDate;
}

function toIsoDate(dateValue: string, timezone: string) {
	if (/^\d{4}-\d{2}-\d{2}$/u.test(dateValue)) {
		return dateValue;
	}

	const parsed = new Date(dateValue);
	if (Number.isNaN(parsed.getTime())) {
		return dateValue;
	}

	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	return formatter.format(parsed);
}

function asString(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function asOptionalBoolean(value: unknown) {
	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'string') {
		if (value === 'true') {
			return true;
		}
		if (value === 'false') {
			return false;
		}
	}

	return undefined;
}

function roundNumber(value: number) {
	return Math.round(value * 100) / 100;
}

function isDefined<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
