import { UserRequirements } from "../commonConfiguration";

export interface TopListConfigurationFile {
	use: string;
	topLists?: TopListConfiguration[];
}

export type WikiTopListConfigurations =
	{
		wiki: string;
		valid: false;
		validationError: string;
	} | {
		wiki: string;
		valid: true;
		topLists: TopListConfiguration[];
	};

export type TopListConfiguration =
	NonLocalizedTopListConfiguration
	| LocalizedTopListConfiguration;

export interface NonLocalizedTopListConfiguration {
	id: string;
	name: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
	columns: TopListColumn[];
}

export function isNonLocalizedTopListConfiguration(obj: unknown): obj is NonLocalizedTopListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["name"] === "string";
}


export interface LocalizedTopListConfiguration {
	id: string;
	i18nKey: string;
	itemCount: number;
	isTimeless: boolean;
	userRequirements: UserRequirements;
	columns: TopListColumn[];
}

export function isLocalizedTopListConfiguration(obj: unknown): obj is LocalizedTopListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["i18nKey"] === "string";
}

export type TopListColumn =
	ParameterlessTopListColumn
	| UserNameTopListColumn
	| TopListColumnWithNamespaceParameter
	| TopListColumnWithLogTypeParameter;

const parameterlessTopListColumnTypes = [
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
export type ParameterlessTopListColumnTypes = typeof parameterlessTopListColumnTypes[number];

const columnsWithNamespaceParameter = [
	"editsInPeriodInNamespace",
	"editsSinceRegistrationInNamespace",
	"revertedEditsInPeriodInNamespace",
	"revertedEditsSinceRegistrationInNamespace"
] as const;
export type TopListColumnTypesWithNamespaceParameter = typeof parameterlessTopListColumnTypes[number];

const columnsWithLogTypeParameter = [
	"logEventsInPeriodByType",
	"logEventsSinceRegistrationByType"
] as const;
export type TopListColumnTypesWithLogTypeParameter = typeof columnsWithLogTypeParameter[number];

export interface ParameterlessTopListColumn {
	type: ParameterlessTopListColumnTypes;
}

export function isParameterlessTopListColumn(obj: unknown): obj is ParameterlessTopListColumn {
	return typeof obj === "object"
		&& obj != null
		&& parameterlessTopListColumnTypes.indexOf(obj["type"]) !== -1;
}

export interface UserNameTopListColumn {
	type: "userName";
	showUserLinks?: boolean;
}

export function isUserNameTopListColumn(obj: unknown): obj is UserNameTopListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "userName";
}

export interface TopListColumnWithNamespaceParameter {
	type: TopListColumnTypesWithNamespaceParameter;
	namespace: number;
}

export function isTopListColumnWithNamespaceParameter(obj: unknown): obj is TopListColumnWithNamespaceParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["namespace"]) === "number";
}

export interface TopListColumnWithLogTypeParameter {
	type: TopListColumnTypesWithLogTypeParameter;
	logType: string;
}

export function isTopListColumnWithLogTypeParameter(obj: unknown): obj is TopListColumnWithLogTypeParameter {
	return typeof obj === "object"
		&& obj != null
		&& columnsWithNamespaceParameter.indexOf(obj["type"]) !== -1
		&& typeof (obj["logType"]) === "string";
}

export interface LogEventsInPeriodByTypeTopListColumn {
	type: "logEventsInPeriodByType";
	logType: string;
}

export function isLogEventsInPeriodInNamespaceTopListColumn(obj: unknown): obj is LogEventsInPeriodByTypeTopListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "logEventsInPeriodByType";
}

export interface LogEventsSinceRegistrationByTypeTopListColumn {
	type: "logEventsSinceRegistrationByType";
	logType: string;
}

export function isLogEventsSinceRegistrationByTypeTopListColumn(obj: unknown): obj is LogEventsSinceRegistrationByTypeTopListColumn {
	return typeof obj === "object"
		&& obj != null
		&& obj["type"] === "logEventsSinceRegistrationByType";
}




