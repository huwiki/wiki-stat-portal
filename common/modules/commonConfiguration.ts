
export interface UserRequirements {
	registrationStatus?: "registered" | "anon",
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;
	userGroups?: ("bot" | "bureaucrat" | "checkuser"
		| "editor" | "flow-bot" | "interface-admin"
		| "interface-editor" | "sysop"
		| "templateeditor" | "trusted")[];
	totalEditsAtLeast?: number | UserEditsInTimeRequirement;
	totalEditsAtMost?: number | UserEditsInTimeRequirement;
	inPeriodEditsAtLeast?: UserEditsInPeriodRequirement;
	inPeriodEditsAtMost?: UserEditsInPeriodRequirement;
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
