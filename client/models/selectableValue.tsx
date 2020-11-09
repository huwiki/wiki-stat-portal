import { makeObservable, observable } from "mobx";

export class SelectableValue {
	id: string = "";
	label: string = "";

	constructor(id: string, label: string) {
		this.id = id;
		this.label = label;

		makeObservable(this, {
			id: observable,
			label: observable
		});
	}
}
