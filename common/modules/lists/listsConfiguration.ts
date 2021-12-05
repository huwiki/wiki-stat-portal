import { UserRequirements } from "../commonConfiguration";

export interface ListsConfigurationFile {
	use: string;
	lists?: ListConfiguration[];
}

export type WikiListConfigurations =
	{
		wiki: string;
		valid: false;
		validationError: string;
	} | {
		wiki: string;
		valid: true;
		lists: ListConfiguration[];
	};

export type ListConfiguration =
	NonLocalizedListConfiguration
	| LocalizedListConfiguration;

export interface NonLocalizedListConfiguration {
	id: string;
	name: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
	columns: ListColumn[];
}

export function isNonLocalizedListConfiguration(obj: unknown): obj is NonLocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["name"] === "string";
}


export interface LocalizedListConfiguration {
	id: string;
	i18nKey: string;
	itemCount: number;
	isTimeless: boolean;
	userRequirements: UserRequirements;
	columns: ListColumn[];
}

export function isLocalizedListConfiguration(obj: unknown): obj is LocalizedListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["i18nKey"] === "string";
}

export type ListColumn =
	ParameterlessListColumn
	| UserNameListColumn
	| ListColumnWithNamespaceParameter
	| ListColumnWithLogTypeParameter;

const parameterlessListColumnTypes = [
	"counter",
	"userRoles",
	"editsInPeriod",
	"editsSinceRegistration",
	"revertedEditsInPeriod",
	"revertedEditsSinceRegistration",
	"firstEditDate",
	"lastEditDate",
	"logEventsInPeriod",
	"logEventsSinceRegistration",
	"thanksInPeriod",
	"thanksSinceRegistration",
	"registrationDate",
	"daysSinceRegistration",
	"activeDaysSinceRegistration",
	"activeDaysInPeriod",
	"averageEditsPerDaySinceRegistration",
	"averageEditsPerDayInPeriod"
] as const;
export type ParameterlessListColumnTypes = typeof parameterlessListColumnTypes[number];

const columnsWithNamespaceParameter = [
	"editsInPeriodInNamespace",
	"editsSinceRegistrationInNamespace",
	"revertedEditsInPeriodInNamespace",
	"revertedEditsSinceRegistrationInNamespace"
] as const;
export type ListColumnTypesWithNamespaceParameter = typeof parameterlessListColumnTypes[number];

const columnsWithLogTypeParameter = [
	"logEventsInPeriodByType",
	"logEventsSinceRegistrationByType"
] as const;
export type ListColumnTypesWithLogTypeParameter = typeof columnsWithLogTypeParameter[number];

export interface ParameterlessListColumn {
	type: ParameterlessListColumnTypes;
}

export function isParameterlessListColumn(obj: unknown): obj is ParameterlessListColumn {
	return typeof obj === "object"
		&& obj != null
		&& parameterlessListColumnTypes.indexOf(obj["type"]) !== -1;
}

export interface UserNameListColumn {
	type: "userName";
	showUserLinks?: boolean;
}

export function isUserNameListColumn(obj: unknown): obj is UserNameListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "userName";
}

export interface ListColumnWithNamespaceParameter {
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
	type: ListColumnTypesWithLogTypeParameter;
	logType: string;
}

export function isListColumnWithLogTypeParameter(obj: unknown): obj is ListColumnWithLogTypeParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["logType"]) === "string";
}

export interface LogEventsInPeriodByTypeListColumn {
	type: "logEventsInPeriodByType";
	logType: string;
}

export function isLogEventsInPeriodInNamespaceListColumn(obj: unknown): obj is LogEventsInPeriodByTypeListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "logEventsInPeriodByType";
}

export interface LogEventsSinceRegistrationByTypeListColumn {
	type: "logEventsSinceRegistrationByType";
	logType: string;
}

export function isLogEventsSinceRegistrationByTypeListColumn(obj: unknown): obj is LogEventsSinceRegistrationByTypeListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "logEventsSinceRegistrationByType";
}




