import { UserRequirements } from "../commonConfiguration";

export interface ListsConfigurationFile {
	use: string;
	lists?: ListConfiguration[];
}

export type WikiListConfigurations =
	{
		wikiId: string;
		valid: false;
		validationError: string;
	} | {
		wikiId: string;
		valid: true;
		lists: ListConfiguration[];
	};

export type ListConfiguration =
	NonLocalizedListConfiguration
	| LocalizedListConfiguration;

export type DateMode = "userSelectable";

interface LocalizationListConfigurationCommon {
	id: string;
	version?: number;
	groupId: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
	columns: ListColumn[];
	orderBy: ListOrderBy[];
	displaySettings: ListDisplaySettings;
	enableCaching: boolean;
	dateMode?: DateMode;
}

export interface NonLocalizedListConfiguration extends LocalizationListConfigurationCommon {
	name: string;
	description?: string;
}

export function isNonLocalizedListConfiguration(obj: unknown): obj is NonLocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["id"] === "string"
		&& typeof obj["groupId"] === "string"
		&& typeof obj["name"] === "string"
		&& typeof obj["orderBy"] === "object";
}

export interface LocalizedListConfiguration extends LocalizationListConfigurationCommon {
	i18nKey: string;
}

export function isLocalizedListConfiguration(obj: unknown): obj is LocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["id"] === "string"
		&& typeof obj["groupId"] === "string"
		&& typeof obj["i18nKey"] === "string"
		&& typeof obj["orderBy"] === "object";
}

export interface ListDisplaySettings {
	fadeBots: boolean;
	fadeNonSysops: boolean;
	skipBotsFromCounting: boolean;
}

export type ListColumn =
	ParameterlessListColumn
	| UserNameListColumn
	| ListColumnWithNamespaceParameter
	| ListColumnWithChangeTagParameter
	| ListColumnWithLogTypeParameter
	| ListColumnWithMilestoneParameter;

const parameterlessListColumnTypes = [
	"counter",
	"userGroups",

	"editsInPeriod",
	"editsInPeriodPercentageToWikiTotal",
	"editsSinceRegistration",
	"editsSinceRegistrationPercentageToWikiTotal",

	"revertedEditsInPeriod",
	"revertedEditsInPeriodPercentageToWikiTotal",
	"revertedEditsInPeriodPercentageToOwnTotalEdits",
	"revertedEditsSinceRegistration",
	"revertedEditsSinceRegistrationPercentageToWikiTotal",
	"revertedEditsSinceRegistrationPercentageToOwnTotalEdits",

	"firstEditDate",
	"lastEditDate",
	"daysBetweenFirstAndLastEdit",
	"averageEditsPerDaySinceRegistration",
	"averageEditsPerDayInPeriod",

	"characterChangesInPeriod",
	"characterChangesInPeriodPercentageToWikiTotal",
	"characterChangesSinceRegistration",
	"characterChangesSinceRegistrationPercentageToWikiTotal",

	"receivedThanksInPeriod",
	"receivedThanksInPeriodPercentageToWikiTotal",
	"receivedThanksSinceRegistration",
	"receivedThanksSinceRegistrationPercentageToWikiTotal",

	"sentThanksInPeriod",
	"sentThanksInPeriodPercentageToWikiTotal",
	"sentThanksSinceRegistration",
	"sentThanksSinceRegistrationPercentageToWikiTotal",

	"logEventsInPeriod",
	"logEventsInPeriodPercentageToWikiTotal",
	"logEventsSinceRegistration",
	"logEventsSinceRegistrationPercentageToWikiTotal",

	"serviceAwardLogEventsInPeriod",
	"serviceAwardLogEventsSinceRegistration",
	"serviceAwardContributionsInPeriod",
	"serviceAwardContributionsSinceRegistration",

	"firstLogEventDate",
	"lastLogEventDate",
	"daysBetweenFirstAndLastLogEvent",
	"averageLogEventsPerDaySinceRegistration",
	"averageLogEventsPerDayInPeriod",

	"registrationDate",
	"daysSinceRegistration",
	"activeDaysInPeriod",
	"activeDaysSinceRegistration",

	"levelAtPeriodStart",
	"levelAtPeriodEnd",
	"levelAtPeriodEndWithChange",
	"levelSortOrder"
] as const;
export type ParameterlessListColumnTypes = typeof parameterlessListColumnTypes[number];

const columnsWithNamespaceParameter = [
	"editsInNamespaceInPeriod",
	"editsInNamespaceInPeriodPercentageToWikiTotal",
	"editsInNamespaceInPeriodPercentageToOwnTotalEdits",
	"editsInNamespaceSinceRegistration",
	"editsInNamespaceSinceRegistrationPercentageToWikiTotal",
	"editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits",
	"revertedEditsInNamespaceInPeriod",
	"revertedEditsInNamespaceInPeriodPercentageToWikiTotal",
	"revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits",
	"revertedEditsInNamespaceSinceRegistration",
	"revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal",
	"revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits",
	"characterChangesInNamespaceInPeriod",
	"characterChangesInNamespaceInPeriodPercentageToWikiTotal",
	"characterChangesInNamespaceSinceRegistration",
	"characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal",
	"activeDaysInNamespaceInPeriod",
	"activeDaysInNamespaceSinceRegistration",
	"lastEditDateInNamespace",
] as const;
export type ListColumnTypesWithNamespaceParameter = typeof columnsWithNamespaceParameter[number];

const columnsWithChangeTagParameter = [
	"editsInPeriodByChangeTag",
	"editsSinceRegistrationByChangeTag",
	"characterChangesInPeriodByChangeTag",
	"characterChangesSinceRegistrationByChangeTag"
] as const;
export type ListColumnTypesWithChangeTagParameter = typeof columnsWithChangeTagParameter[number];

const columnsWithLogTypeParameter = [
	"logEventsInPeriodByType", // OK
	"logEventsSinceRegistrationByType", // OK
	"lastLogEventDateByType",
] as const;
export type ListColumnTypesWithLogTypeParameter = typeof columnsWithLogTypeParameter[number];

interface ColumnCommonProperties {
	columnId?: string;
	headerI18nKey?: string;
	filterByRule?: "moreThanZero";
	isHidden?: boolean;
}

export interface ParameterlessListColumn extends ColumnCommonProperties {
	type: ParameterlessListColumnTypes;
	filterByRule?: "moreThanZero";
}

export function isParameterlessListColumn(obj: unknown): obj is ParameterlessListColumn {
	return typeof obj === "object"
		&& obj != null
		&& parameterlessListColumnTypes.indexOf(obj["type"]) !== -1;
}

export interface UserNameListColumn extends ColumnCommonProperties {
	type: "userName";
	userLinks?: UserLinksDefinition;
}

export interface UserLinksDefinition {
	talkPage?: boolean;
	edits?: boolean;
	rightsLog?: boolean;
}

export function isUserNameListColumn(obj: unknown): obj is UserNameListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "userName";
}

export interface ListColumnWithNamespaceParameter extends ColumnCommonProperties {
	type: ListColumnTypesWithNamespaceParameter;
	namespace: number | number[];
}

export function isListColumnWithNamespaceParameter(obj: unknown): obj is ListColumnWithNamespaceParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["namespace"]) === "number";
}

export interface ListColumnWithChangeTagParameter extends ColumnCommonProperties {
	type: ListColumnTypesWithChangeTagParameter;
	changeTag: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
}

export interface ChangeTagFilterDefinition {
	namespace?: number;
	changeTagId: number;
}

export function isListColumnWithChangeTagParameter(obj: unknown): obj is ListColumnWithChangeTagParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["changeTag"]) === "object";
}

export interface ListColumnWithLogTypeParameter extends ColumnCommonProperties {
	type: ListColumnTypesWithLogTypeParameter;
	logFilter: LogFilterDefinition | LogFilterDefinition[];
}

export interface LogFilterDefinition {
	logType?: string;
	logAction?: string;
}

export function isListColumnWithLogTypeParameter(obj: unknown): obj is ListColumnWithLogTypeParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["logFilter"]) === "object";
}

export interface ListOrderBy {
	columnId: string;
	direction: "ascending" | "descending"
}

const columnsWithMilestoneParameter = [
	"editsSinceRegistrationMilestone",
	"revertedEditsSinceRegistrationMilestone",
	"characterChangesSinceRegistrationMilestone",
	"receivedThanksSinceRegistrationMilestone"
] as const;
export type ListColumnTypesWithMilestoneParameter = typeof columnsWithMilestoneParameter[number];

export interface ListColumnWithMilestoneParameter extends ColumnCommonProperties {
	type: ListColumnTypesWithMilestoneParameter;
	milestones: number[];
}

export type AllColumnTypes =
	ParameterlessListColumnTypes
	| ListColumnTypesWithNamespaceParameter
	| ListColumnTypesWithLogTypeParameter
	| ListColumnTypesWithChangeTagParameter
	| ListColumnTypesWithMilestoneParameter
	| "userName";
