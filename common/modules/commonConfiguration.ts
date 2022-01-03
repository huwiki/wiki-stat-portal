import { ChangeTagFilterDefinition } from "./lists/listsConfiguration";

export type UserGroup = "bot" | "flaglessBot" | "bureaucrat" | "checkuser"
	| "editor" | "flow-bot" | "interface-admin"
	| "interface-editor" | "sysop"
	| "templateeditor" | "trusted";

export interface UserRequirements {
	registrationStatus?: "registered" | "anon";
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;

	userGroups?: UserGroup[];
	notInUserGroups?: UserGroup[];

	hasTalkTemplates: string[];
	hasNoTalkTemplates: string[];

	totalEditsAtLeast?: number | UserStatisticsInTimeRequirement;
	totalEditsAtMost?: number | UserStatisticsInTimeRequirement;
	totalEditsMilestoneReachedInPeriod: number[];
	inPeriodEditsAtLeast?: UserStatisticsInPeriodRequirement;
	inPeriodEditsAtMost?: UserStatisticsInPeriodRequirement;

	totalEditsWithChangeTagAtLeast?: UserEditsInTimeWithChangeTagRequirement;
	totalEditsWithChangeTagAtMost?: UserEditsInTimeWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtLeast?: UserEditsInPeriodWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtMost?: UserEditsInPeriodWithChangeTagRequirement;

	totalRevertedEditsAtLeast?: number | UserStatisticsInTimeRequirement;
	totalRevertedEditsAtMost?: number | UserStatisticsInTimeRequirement;
	totalRevertedEditsMilestoneReachedInPeriod: number[];
	inPeriodRevertedEditsAtLeast?: UserStatisticsInPeriodRequirement;
	inPeriodRevertedEditsAtMost?: UserStatisticsInPeriodRequirement;

	totalReceivedThanksAtLeast?: number | UserStatisticsInTimeRequirement;
	totalReceivedThanksAtMost?: number | UserStatisticsInTimeRequirement;
	totalReceivedThanksMilestoneReachedInPeriod: number[];
	inPeriodReceivedThanksAtLeast?: UserStatisticsInPeriodRequirement;
	inPeriodReceivedThanksAtMost?: UserStatisticsInPeriodRequirement;

	totalActiveDaysAtLeast?: number | UserStatisticsInTimeRequirement;
	totalActiveDaysAtMost?: number | UserStatisticsInTimeRequirement;
	totalActiveDaysMilestoneReachedInPeriod: number[];
	inPeriodActiveDaysAtLeast?: UserStatisticsInPeriodRequirement;
	inPeriodActiveDaysAtMost?: UserStatisticsInPeriodRequirement;
}

export interface UserStatisticsInTimeRequirement {
	count: number;
	epoch: number;
}

export interface UserStatisticsInPeriodRequirement {
	count: number;
	period: number;
	epoch?: number;
}

export interface UserEditsInTimeWithChangeTagRequirement {
	changeTag: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
	edits: number;
	epoch?: number;
}

export interface UserEditsInPeriodWithChangeTagRequirement {
	changeTag: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
	edits: number;
	period: number;
	epoch?: number;
}
