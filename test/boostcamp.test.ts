import { describe, expect, it, vi } from 'vitest';
import {
	coerceCredentials,
	createBoostcampClient,
} from '../nodes/Boostcamp/boostcamp.api';
import {
	buildWorkoutsResult,
	normalizeTrainingHistory,
	validateDateRange,
} from '../nodes/Boostcamp/boostcamp.normalize';

function mockResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() {
			return body;
		},
		async text() {
			return JSON.stringify(body);
		},
	};
}

const sampleHistory = {
	'2026-06-10': [
		{
			id: 'session-1',
			name: 'Upper A',
			week: 0,
			day: 1,
			duration: 3600,
			records: [
				{
					id: 'exercise-1',
					name: 'Bench Press',
					sets: [
						{ archived_reps: 5, archived_weight: 100, target: 5, target_type: 'reps' },
						{ archived_reps: 5, archived_weight: 100, target: 5, target_type: 'reps' },
					],
				},
				{
					id: 'exercise-2',
					name: 'Pull Up',
					sets: [{ archived_reps: 8, archived_weight: 0, target: 8, target_type: 'reps' }],
				},
			],
		},
	],
};

describe('boostcamp.api', () => {
	it('returns BOOSTCAMP_AUTH_FAILED when login fails', async () => {
		const request = vi
			.fn()
			.mockResolvedValue(mockResponse(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }));

		const promise = createBoostcampClient(
			{
				authMode: 'emailPassword',
				email: 'user@example.com',
				password: 'wrong-password',
			},
			request as never,
		);

		await expect(promise).rejects.toBeInstanceOf(Error);
		await expect(promise).rejects.toMatchObject({ code: 'BOOSTCAMP_AUTH_FAILED' });
	});

	it('coerces credential fields', () => {
		const credentials = coerceCredentials({
			authMode: 'token',
			token: 'abc',
			apiBaseUrl: 'https://example.com/api',
		});

		expect(credentials).toEqual({
			authMode: 'token',
			email: undefined,
			password: undefined,
			token: 'abc',
			sessionCookie: undefined,
			apiBaseUrl: 'https://example.com/api',
		});
	});
});

describe('boostcamp.normalize', () => {
	it('returns BOOSTCAMP_NO_WORKOUTS_FOUND for empty history', () => {
		const result = normalizeTrainingHistory({}, {
			startDate: '2026-06-01',
			endDate: '2026-06-30',
			timezone: 'Asia/Tokyo',
			weightUnit: 'kg',
			normalize: true,
		});

		expect(result.sessions).toEqual([]);
		expect(result.warnings.map((warning) => warning.code)).toContain('BOOSTCAMP_NO_WORKOUTS_FOUND');
	});

	it('normalizes workouts and summary', () => {
		const result = normalizeTrainingHistory(sampleHistory, {
			startDate: '2026-06-01',
			endDate: '2026-06-30',
			timezone: 'Asia/Tokyo',
			weightUnit: 'kg',
			normalize: true,
		});

		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0].exercises[0].normalizedName).toBe('bench press');
		expect(result.summary).toEqual({
			sessions: 1,
			exercises: 2,
			totalSets: 3,
			workingSets: 3,
			totalVolumeKg: 1000,
		});
	});

	it('converts lb values to kg', () => {
		const result = normalizeTrainingHistory(
			{
				'2026-06-10': [
					{
						id: 'session-1',
						name: 'Heavy Day',
						records: [
							{
								name: 'Squat',
								sets: [{ archived_reps: 5, archived_weight: 225, target: 5, target_type: 'reps' }],
							},
						],
					},
				],
			},
			{
				startDate: '2026-06-01',
				endDate: '2026-06-30',
				timezone: 'Asia/Tokyo',
				weightUnit: 'lbs',
				normalize: true,
			},
		);

		expect(result.sessions[0].exercises[0].sets[0].weightKg).toBe(102.06);
		expect(result.summary.totalVolumeKg).toBe(510.3);
	});

	it('emits BOOSTCAMP_UNKNOWN_EXERCISE_FORMAT for malformed exercises', () => {
		const result = normalizeTrainingHistory(
			{
				'2026-06-10': [
					{
						id: 'session-1',
						name: 'Malformed',
						records: [{ foo: 'bar' }],
					},
				],
			},
			{
				startDate: '2026-06-01',
				endDate: '2026-06-30',
				timezone: 'Asia/Tokyo',
				weightUnit: 'kg',
				normalize: true,
			},
		);

		expect(result.warnings.map((warning) => warning.code)).toContain(
			'BOOSTCAMP_UNKNOWN_EXERCISE_FORMAT',
		);
	});

	it('omits raw payload when includeRaw is false', () => {
		const normalized = normalizeTrainingHistory(sampleHistory, {
			startDate: '2026-06-01',
			endDate: '2026-06-30',
			timezone: 'Asia/Tokyo',
			weightUnit: 'kg',
			normalize: true,
		});
		const result = buildWorkoutsResult({
			startDate: '2026-06-01',
			endDate: '2026-06-30',
			timezone: 'Asia/Tokyo',
			sessions: normalized.sessions,
			summary: normalized.summary,
			warnings: normalized.warnings,
			raw: null,
		});

		expect(result.raw).toBeNull();
	});

	it('validates date range format and order', () => {
		expect(() => validateDateRange('2026-06-30', '2026-06-01')).toThrow();
		expect(() => validateDateRange('2026/06/01', '2026-06-30')).toThrow();
	});
});
