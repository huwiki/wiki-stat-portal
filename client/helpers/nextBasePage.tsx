import * as React from "react";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { I18nProvider } from "./i18nClient";

export abstract class NextBasePage<T extends CommonPageProps> extends React.Component<T> {
	protected i18nProvider: I18nProvider;

	protected t(group: string, key: string): string {
		return this.i18nProvider.t(group, key);
	}

	constructor(props: T) {
		super(props);
		this.i18nProvider = new I18nProvider(this.props.i18nData);
	}

	public componentDidMount(): void {
		const { appBaseStyle } = this.props;
		if (appBaseStyle === "dark") {
			document.querySelector("body")?.classList.add("bp3-dark");
		} else {
			document.querySelector("body")?.classList.remove("bp3-dark");
		}
	}
}
