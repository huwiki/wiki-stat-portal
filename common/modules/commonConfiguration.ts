import { ChangeTagFilterDefinition } from "./lists/listsConfiguration";

export type UserGroup = "bot" | "flaglessBot" | "bureaucrat" | "checkuser"
	| "editor" | "flow-bot" | "interface-admin"
	| "interface-editor" | "sysop"
	| "templateeditor" | "trusted";

export interface UserRequirements {
	registrationStatus?: "registered" | "anon";
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;

	inAnyUserGroups?: UserGroup[];
	inAllUserGroups?: UserGroup[];
	notInAnyUserGroups?: UserGroup[];
	notInAllUserGroups?: UserGroup[];

	hasAnyUserPageTemplates?: string[];
	hasAllUserPageTemplates?: string[];
	notHasAnyUserPageTemplates?: string[];
	notHasAllUserPageTemplates?: string[];

	totalEditsAtLeast?: number | UserStatisticsInTimeRequirement;
	totalEditsAtMost?: number | UserStatisticsInTimeRequirement;
	inPeriodEditsAtLeast?: number | UserStatisticsInPeriodRequirement;
	inPeriodEditsAtMost?: number | UserStatisticsInPeriodRequirement;
	totalEditsMilestoneReachedInPeriod: number[];

	totalEditsInNamespaceAtLeast?: UserEditsInTimeWithNamespaceRequirement;
	totalEditsInNamespaceAtMost?: UserEditsInTimeWithNamespaceRequirement;
	inPeriodEditsInNamespaceAtLeast?: UserEditsInPeriodWithNamespaceRequirement;
	inPeriodEditsInNamespaceAtMost?: UserEditsInPeriodWithNamespaceRequirement;

	totalEditsWithChangeTagAtLeast?: UserEditsInTimeWithChangeTagRequirement;
	totalEditsWithChangeTagAtMost?: UserEditsInTimeWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtLeast?: UserEditsInPeriodWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtMost?: UserEditsInPeriodWithChangeTagRequirement;

	totalRevertedEditsAtLeast?: number | UserStatisticsInTimeRequirement;
	totalRevertedEditsAtMost?: number | UserStatisticsInTimeRequirement;
	totalRevertedEditsMilestoneReachedInPeriod: number[];
	inPeriodRevertedEditsAtLeast?: number | UserStatisticsInPeriodRequirement;
	inPeriodRevertedEditsAtMost?: number | UserStatisticsInPeriodRequirement;

	totalReceivedThanksAtLeast?: number | UserStatisticsInTimeRequirement;
	totalReceivedThanksAtMost?: number | UserStatisticsInTimeRequirement;
	totalReceivedThanksMilestoneReachedInPeriod: number[];
	inPeriodReceivedThanksAtLeast?: number | UserStatisticsInPeriodRequirement;
	inPeriodReceivedThanksAtMost?: number | UserStatisticsInPeriodRequirement;

	totalActiveDaysAtLeast?: number | UserStatisticsInTimeRequirement;
	totalActiveDaysAtMost?: number | UserStatisticsInTimeRequirement;
	totalActiveDaysMilestoneReachedInPeriod: number[];
	inPeriodActiveDaysAtLeast?: number | UserStatisticsInPeriodRequirement;
	inPeriodActiveDaysAtMost?: number | UserStatisticsInPeriodRequirement;
}

export interface UserStatisticsInTimeRequirement {
	count: number;
	epoch: number | "startOfSelectedPeriod";
}

export interface UserStatisticsInPeriodRequirement {
	count: number;
	period: number;
	epoch?: number | "startOfSelectedPeriod";
}

export interface UserEditsInTimeWithNamespaceRequirement {
	namespace: number | number[];
	edits: number;
	epoch?: number | "startOfSelectedPeriod";
}

export interface UserEditsInPeriodWithNamespaceRequirement {
	namespace: number | number[];
	edits: number;
	period?: number;
	epoch?: number | "startOfSelectedPeriod";
}

export interface UserEditsInTimeWithChangeTagRequirement {
	changeTag: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
	edits: number;
	epoch?: number | "startOfSelectedPeriod";
}

export interface UserEditsInPeriodWithChangeTagRequirement {
	changeTag: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
	edits: number;
	period?: number;
	epoch?: number | "startOfSelectedPeriod";
}
