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

export interface NonLocalizedListConfiguration {
	id: string;
	groupId: string;
	name: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
	columns: ListColumn[];
	orderBy: ListOrderBy[];
	displaySettings: ListDisplaySettings;
}

export function isNonLocalizedListConfiguration(obj: unknown): obj is NonLocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["id"] === "string"
		&& typeof obj["groupId"] === "string"
		&& typeof obj["name"] === "string"
		&& typeof obj["orderBy"] === "object";
}

export interface LocalizedListConfiguration {
	id: string;
	groupId: string;
	i18nKey: string;
	itemCount: number;
	isTimeless: boolean;
	userRequirements: UserRequirements;
	columns: ListColumn[];
	orderBy: ListOrderBy[];
	displaySettings: ListDisplaySettings;
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
	skipBotsFromCounting: boolean;
}

export type ListColumn =
	ParameterlessListColumn
	| UserNameListColumn
	| ListColumnWithNamespaceParameter
	| ListColumnWithChangeTagParameter
	| ListColumnWithLogTypeParameter;

const parameterlessListColumnTypes = [
	"counter",
	"userGroups", // OK

	"editsInPeriod", // OK
	"editsInPeriodPercentageToWikiTotal", // OK
	"editsAtPeriodStart", // OK, internal for now
	"editsSinceRegistration", // OK
	"editsSinceRegistrationPercentageToWikiTotal", // OK

	"revertedEditsInPeriod", // OK
	"revertedEditsInPeriodPercentageToWikiTotal", // OK
	"revertedEditsInPeriodPercentageToOwnTotalEdits",
	"revertedEditsSinceRegistration", // OK
	"revertedEditsSinceRegistrationPercentageToWikiTotal", // OK
	"revertedEditsSinceRegistrationPercentageToOwnTotalEdits",

	"firstEditDate", // OK
	"lastEditDate", // OK
	"daysBetweenFirstAndLastEdit", // OK
	"averageEditsPerDaySinceRegistration", // OK
	"averageEditsPerDayInPeriod", // OK

	"characterChangesInPeriod", // OK
	"characterChangesInPeriodPercentageToWikiTotal", // OK
	"characterChangesSinceRegistration", // OK
	"characterChangesSinceRegistrationPercentageToWikiTotal", // OK

	"receivedThanksInPeriod", // OK
	"receivedThanksInPeriodPercentageToWikiTotal", // OK
	"receivedThanksSinceRegistration", // OK
	"receivedThanksSinceRegistrationPercentageToWikiTotal", // OK

	"sentThanksInPeriod", // OK
	"sentThanksInPeriodPercentageToWikiTotal", // OK
	"sentThanksSinceRegistration", // OK
	"sentThanksSinceRegistrationPercentageToWikiTotal", // OK

	"logEventsInPeriod", // OK
	"logEventsInPeriodPercentageToWikiTotal", // OK
	"logEventsAtPeriodStart", // OK, internal for now
	"logEventsSinceRegistration", // OK
	"logEventsSinceRegistrationPercentageToWikiTotal", // OK

	"firstLogEventDate", // OK
	"lastLogEventDate", // OK
	"daysBetweenFirstAndLastLogEvent", // OK
	"averageLogEventsPerDaySinceRegistration", // OK
	"averageLogEventsPerDayInPeriod", // OK

	"registrationDate", // OK
	"daysSinceRegistration", // OK
	"activeDaysInPeriod", // OK
	"activeDaysSinceRegistration", // OK

	"levelAtPeriodStart", // OK
	"levelAtPeriodEnd", // OK
	"levelAtPeriodEndWithChange" // OK
] as const;
export type ParameterlessListColumnTypes = typeof parameterlessListColumnTypes[number];

const columnsWithNamespaceParameter = [
	"editsInNamespaceInPeriod", // OK
	"editsInNamespaceInPeriodPercentageToWikiTotal", // OK
	"editsInNamespaceInPeriodPercentageToOwnTotalEdits",
	"editsInNamespaceSinceRegistration", // OK
	"editsInNamespaceSinceRegistrationPercentageToWikiTotal", // OK
	"editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits",
	"revertedEditsInNamespaceInPeriod", // OK
	"revertedEditsInNamespaceInPeriodPercentageToWikiTotal", // OK
	"revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits",
	"revertedEditsInNamespaceSinceRegistration", // OK
	"revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal", // OK
	"revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits",
	"characterChangesInNamespaceInPeriod", // OK
	"characterChangesInNamespaceInPeriodPercentageToWikiTotal", // OK
	"characterChangesInNamespaceSinceRegistration", // OK
	"characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal", // OK
	"activeDaysInNamespaceInPeriod", // OK
	"activeDaysInNamespaceSinceRegistration", // OK
] as const;
export type ListColumnTypesWithNamespaceParameter = typeof columnsWithNamespaceParameter[number];

const columnsWithChangeTagParameter = [
	"editsInPeriodByChangeTag", // OK
	"editsSinceRegistrationByChangeTag", // OK
	"characterChangesInPeriodByChangeTag", // OK
	"characterChangesSinceRegistrationByChangeTag" // OK
] as const;
export type ListColumnTypesWithChangeTagParameter = typeof columnsWithChangeTagParameter[number];

const columnsWithLogTypeParameter = [
	"logEventsInPeriodByType", // OK
	"logEventsSinceRegistrationByType", // OK
	"firstLogEventDateByType",
	"lastLogEventDateByType",
] as const;
export type ListColumnTypesWithLogTypeParameter = typeof columnsWithLogTypeParameter[number];

interface ColumnCommonProperties {
	columnId?: string;
	headerI18nKey?: string;
	filterByRule?: "moreThanZero";
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

export type AllColumnTypes =
	ParameterlessListColumnTypes
	| ListColumnTypesWithNamespaceParameter
	| ListColumnTypesWithLogTypeParameter
	| ListColumnTypesWithChangeTagParameter
	| "userName";
