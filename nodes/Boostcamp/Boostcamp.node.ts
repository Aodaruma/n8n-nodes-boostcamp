import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	coerceCredentials,
	createBoostcampClient,
	toBoostcampIssue,
} from './boostcamp.api';
import {
	buildWorkoutsResult,
	getTimezoneOffsetMinutes,
	normalizeTrainingHistory,
	validateDateRange,
} from './boostcamp.normalize';
import type { BoostcampWorkoutsResult } from './boostcamp.types';

export class Boostcamp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Boostcamp',
		name: 'boostcamp',
		icon: { light: 'file:boostcamp.svg', dark: 'file:boostcamp.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Access workout history from the unofficial Boostcamp API',
		defaults: {
			name: 'Boostcamp',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'boostcampApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Workout Summary',
						value: 'getWorkoutSummary',
					},
					{
						name: 'Get Workouts',
						value: 'getWorkouts',
					},
					{
						name: 'Test Auth',
						value: 'testAuth',
					},
				],
				default: 'testAuth',
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'string',
				default: '',
				placeholder: '2026-06-07',
				displayOptions: {
					show: {
						operation: ['getWorkouts', 'getWorkoutSummary'],
					},
				},
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'string',
				default: '',
				placeholder: '2026-06-13',
				displayOptions: {
					show: {
						operation: ['getWorkouts', 'getWorkoutSummary'],
					},
				},
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: 'Asia/Tokyo',
				displayOptions: {
					show: {
						operation: ['getWorkouts', 'getWorkoutSummary'],
					},
				},
			},
			{
				displayName: 'Normalize',
				name: 'normalize',
				type: 'boolean',
				default: true,
				description: 'Whether to normalize exercise names and set metadata',
				displayOptions: {
					show: {
						operation: ['getWorkouts', 'getWorkoutSummary'],
					},
				},
			},
			{
				displayName: 'Include Raw',
				name: 'includeRaw',
				type: 'boolean',
				default: false,
				description: 'Whether to include the filtered raw Boostcamp payload in the output',
				displayOptions: {
					show: {
						operation: ['getWorkouts', 'getWorkoutSummary'],
					},
				},
			},
			{
				displayName: 'Fail On Error',
				name: 'failOnError',
				type: 'boolean',
				default: false,
				description: 'Whether to throw instead of returning a structured error payload',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const failOnError = this.getNodeParameter('failOnError', itemIndex, false) as boolean;

			try {
				const credentials = coerceCredentials(
					(await this.getCredentials('boostcampApi')) as IDataObject,
				);
				const client = await createBoostcampClient(credentials);
				const operation = this.getNodeParameter('operation', itemIndex) as
					| 'testAuth'
					| 'getWorkouts'
					| 'getWorkoutSummary';

				let result: BoostcampWorkoutsResult;
				if (operation === 'testAuth') {
					result = await executeTestAuth(client);
				} else {
					const startDate = this.getNodeParameter('startDate', itemIndex) as string;
					const endDate = this.getNodeParameter('endDate', itemIndex) as string;
					const timezone = this.getNodeParameter('timezone', itemIndex) as string;
					const normalize = this.getNodeParameter('normalize', itemIndex, true) as boolean;
					const includeRaw = this.getNodeParameter('includeRaw', itemIndex, false) as boolean;

					validateDateRange(startDate, endDate);
					const referenceDate = midRangeDate(startDate, endDate);
					const timezoneOffset = getTimezoneOffsetMinutes(timezone, referenceDate);
					const [profileResponse, historyResponse] = await Promise.all([
						client.getUserProfile(),
						client.getTrainingHistory(timezoneOffset),
					]);
					const profile = unwrapData(profileResponse);
					const historyData = unwrapData(historyResponse);
					const weightUnit = extractWeightUnit(profile);
					const normalized = normalizeTrainingHistory(historyData, {
						startDate,
						endDate,
						timezone,
						weightUnit,
						normalize,
					});

					result = buildWorkoutsResult({
						startDate,
						endDate,
						timezone,
						sessions:
							operation === 'getWorkoutSummary' ? [] : normalized.sessions,
						summary: normalized.summary,
						warnings: normalized.warnings,
						raw: includeRaw ? normalized.filteredRaw : null,
					});
					result.account = {
						id: asString((profile as IDataObject)?.id),
						name: asString((profile as IDataObject)?.name),
						displayName: asString((profile as IDataObject)?.displayName),
						email: asString((profile as IDataObject)?.email),
						weightUnit,
					};
				}

				returnData.push({
					json: result as unknown as IDataObject,
					pairedItem: itemIndex,
				});
			} catch (error) {
				const issue = toBoostcampIssue(error);
				if (failOnError && !this.continueOnFail()) {
					throw new NodeOperationError(this.getNode(), issue.message, {
						itemIndex,
						description: issue.code,
					});
				}

				returnData.push({
					json: {
						ok: false,
						source: 'boostcamp',
						sessions: [],
						summary: {
							sessions: 0,
							exercises: 0,
							totalSets: 0,
							workingSets: 0,
							totalVolumeKg: 0,
						},
						warnings: [],
						errors: [issue],
						raw: null,
					} as unknown as IDataObject,
					pairedItem: itemIndex,
				});
			}
		}

		return [returnData];
	}
}

async function executeTestAuth(
	client: Awaited<ReturnType<typeof createBoostcampClient>>,
): Promise<BoostcampWorkoutsResult> {
	const response = unwrapData(await client.getUserProfile());
	const profile = (response ?? {}) as IDataObject;
	const weightUnit = extractWeightUnit(profile);

	return {
		ok: true,
		source: 'boostcamp',
		account: {
			id: asString(profile.id),
			name: asString(profile.name),
			displayName: asString(profile.displayName),
			email: asString(profile.email),
			weightUnit,
		},
		sessions: [],
		summary: {
			sessions: 0,
			exercises: 0,
			totalSets: 0,
			workingSets: 0,
			totalVolumeKg: 0,
		},
		warnings: [],
		errors: [],
		raw: null,
	};
}

function unwrapData(value: unknown) {
	if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
		return (value as Record<string, unknown>).data;
	}

	return value;
}

function extractWeightUnit(profile: unknown) {
	if (!profile || typeof profile !== 'object') {
		return undefined;
	}

	const preference = (profile as Record<string, unknown>).preference;
	if (!preference || typeof preference !== 'object') {
		return undefined;
	}

	return asString((preference as Record<string, unknown>).weightUnit);
}

function midRangeDate(startDate: string, endDate: string) {
	const start = new Date(`${startDate}T00:00:00Z`).getTime();
	const end = new Date(`${endDate}T00:00:00Z`).getTime();
	return new Date(start + (end - start) / 2);
}

function asString(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}
