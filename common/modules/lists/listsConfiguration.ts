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
}

export function isLocalizedListConfiguration(obj: unknown): obj is LocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["id"] === "string"
		&& typeof obj["groupId"] === "string"
		&& typeof obj["i18nKey"] === "string"
		&& typeof obj["orderBy"] === "object";
}

export type ListColumn =
	ParameterlessListColumn
	| UserNameListColumn
	| ListColumnWithNamespaceParameter
	| ListColumnWithLogTypeParameter;

const parameterlessListColumnTypes = [
	"counter",
	"userRoles",

	"editsInPeriod", // OK
	"editsInPeriodPercentage", // OK
	"editsSinceRegistration", // OK
	"editsSinceRegistrationPercentage", // OK
	"revertedEditsInPeriod", // OK
	"revertedEditsInPeriodPercentage", // OK
	"revertedEditsSinceRegistration", // OK
	"revertedEditsSinceRegistrationPercentage", // OK
	"firstEditDate", // OK
	"lastEditDate", // OK
	"daysBetweenFirstAndLastEdit", // OK
	"averageEditsPerDaySinceRegistration", // OK
	"averageEditsPerDayInPeriod", // OK

	"characterChangesInPeriod", // OK
	"characterChangesInPeriodPercentage", // OK
	"characterChangesSinceRegistration", // OK
	"characterChangesSinceRegistrationPercentage", // OK

	"thanksInPeriod", // OK
	"thanksInPeriodPercentage", // OK
	"thanksSinceRegistration", // OK
	"thanksSinceRegistrationPercentage", // OK

	"logEventsInPeriod", // OK
	"logEventsInPeriodPercentage", // OK
	"logEventsSinceRegistration", // OK
	"logEventsSinceRegistrationPercentage", // OK
	"firstLogEventDate", // OK
	"lastLogEventDate", // OK
	"daysBetweenFirstAndLastLogEvent", // OK
	"averageLogEventsPerDaySinceRegistration", // OK
	"averageLogEventsPerDayInPeriod", // OK

	"registrationDate", // OK
	"daysSinceRegistration", // OK
	"activeDaysInPeriod", // OK
	"activeDaysSinceRegistration", // OK

	"levelAtPeriodStart",
	"levelAtPeriodEnd",
	"levelAtPeriodEndWithChange"
] as const;
export type ParameterlessListColumnTypes = typeof parameterlessListColumnTypes[number];

const columnsWithNamespaceParameter = [
	"editsInNamespaceInPeriod", // OK
	"editsInNamespaceInPeriodPercentage", // OK
	"editsInNamespaceSinceRegistration", // OK
	"editsInNamespaceSinceRegistrationPercentage", // OK
	"revertedEditsInNamespaceInPeriod", // OK
	"revertedEditsInNamespaceInPeriodPercentage", // OK
	"revertedEditsInNamespaceSinceRegistration", // OK
	"revertedEditsInNamespaceSinceRegistrationPercentage", // OK
	"characterChangesInNamespaceInPeriod", // OK
	"characterChangesInNamespaceInPeriodPercentage", // OK
	"characterChangesInNamespaceSinceRegistration", // OK
	"characterChangesInNamespaceSinceRegistrationPercentage", // OK
	"activeDaysInNamespaceInPeriod", // OK
	"activeDaysInNamespaceSinceRegistration", // OK
] as const;
export type ListColumnTypesWithNamespaceParameter = typeof columnsWithNamespaceParameter[number];

const columnsWithLogTypeParameter = [
	"logEventsInPeriodByType",
	"logEventsSinceRegistrationByType"
] as const;
export type ListColumnTypesWithLogTypeParameter = typeof columnsWithLogTypeParameter[number];

export interface ParameterlessListColumn {
	columnId: string;
	type: ParameterlessListColumnTypes;
}

export function isParameterlessListColumn(obj: unknown): obj is ParameterlessListColumn {
	return typeof obj === "object"
		&& obj != null
		&& parameterlessListColumnTypes.indexOf(obj["type"]) !== -1;
}

export interface UserNameListColumn {
	columnId: string;
	type: "userName"; // OK
	showUserLinks?: boolean;
}

export function isUserNameListColumn(obj: unknown): obj is UserNameListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "userName";
}

export interface ListColumnWithNamespaceParameter {
	columnId: string;
	type: ListColumnTypesWithNamespaceParameter;
	namespace: number;
}

export function isListColumnWithNamespaceParameter(obj: unknown): obj is ListColumnWithNamespaceParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["namespace"]) === "number";
}

export interface ListColumnWithLogTypeParameter {
	columnId: string;
	type: ListColumnTypesWithLogTypeParameter;
	logAction: string;
	logType: string;
}

export function isListColumnWithLogTypeParameter(obj: unknown): obj is ListColumnWithLogTypeParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["logType"]) === "string";
}

export interface ListOrderBy {
	columnId: string;
	direction: "ascending" | "descending"
}

export type AllColumnTypes =
	ParameterlessListColumnTypes
	| ListColumnTypesWithNamespaceParameter
	| ListColumnTypesWithLogTypeParameter
	| "userName";
