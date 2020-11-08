import DefaultErrorPage from "next/error";
import Head from "next/head";
import * as React from "react";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { I18nProvider } from "./i18nClient";

export abstract class NextBasePage<T extends CommonPageProps> extends React.Component<T> {
	protected i18nProvider: I18nProvider;

	protected t = (key: string): string => {
		return this.i18nProvider.t(key);
	}

	constructor(props: T) {
		super(props);
		this.i18nProvider = new I18nProvider(this.props.i18nData);
	}

	protected render404Page(): JSX.Element {
		return <>
			<Head>
				<meta name="robots" content="noindex" />
			</Head>
			<DefaultErrorPage statusCode={404} title={this.t("pageNotFound")} />
		</>;
	}
}
