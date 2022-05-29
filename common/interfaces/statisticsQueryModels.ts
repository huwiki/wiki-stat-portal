
export interface ActorLike {
	actorId: number;
	actorName?: string;
	actorGroups?: string[];
}


export interface ActorResult {
	actorId: number;
	name?: string;
	groups?: string[];
	columnData?: unknown[];
}

export interface GroupActor {
	id: number;
	name?: string;
}
export interface GroupedResult {
	columnData: unknown[];
	users: GroupActor[];
}
