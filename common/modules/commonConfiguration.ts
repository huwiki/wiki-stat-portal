
export interface UserRequirements {
	registrationStatus?: "registered" | "anon",
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;
	userGroups?: ("bot" | "flaglessBot" | "bureaucrat" | "checkuser"
		| "editor" | "flow-bot" | "interface-admin"
		| "interface-editor" | "sysop"
		| "templateeditor" | "trusted")[];
	totalEditsAtLeast?: number | UserEditsInTimeRequirement;
	totalEditsAtMost?: number | UserEditsInTimeRequirement;
	inPeriodEditsAtLeast?: UserEditsInPeriodRequirement;
	inPeriodEditsAtMost?: UserEditsInPeriodRequirement;
	totalEditsWithChangeTagAtLeast?: number | UserEditsInTimeWithChangeTagRequirement;
	totalEditsWithChangeTagAtMost?: number | UserEditsInTimeWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtLeast?: UserEditsInPeriodWithChangeTagRequirement;
	inPeriodEditsWithChangeTagAtMost?: UserEditsInPeriodWithChangeTagRequirement;
	totalRevertedEditsAtLeast?: number | UserEditsInTimeRequirement;
	totalRevertedEditsAtMost?: number | UserEditsInTimeRequirement;
	inPeriodRevertedEditsAtLeast?: UserEditsInPeriodRequirement;
	inPeriodRevertedEditsAtMost?: UserEditsInPeriodRequirement;
	totalReceivedThanksAtLeast?: number | UserEditsInTimeRequirement;
	totalReceivedThanksAtMost?: number | UserEditsInTimeRequirement;
	inPeriodReceivedThanksAtLeast?: UserEditsInPeriodRequirement;
	inPeriodReceivedThanksAtMost?: UserEditsInPeriodRequirement;
}

export interface UserEditsInTimeRequirement {
	edits: number;
	epoch: number;
}

export interface UserEditsInPeriodRequirement {
	edits: number;
	period: number;
	epoch?: number;
}

export interface UserEditsInTimeWithChangeTagRequirement {
	edits: number;
	epoch: number;
}

export interface UserEditsInPeriodWithChangeTagRequirement {
	edits: number;
	period: number;
	epoch?: number;
}
