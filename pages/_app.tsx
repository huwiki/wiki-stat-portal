import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "normalize.css/normalize.css";
import * as React from "react";
import { CommonPageProps } from "../helpers/commonPageProps";
import "../styles/globals.scss";

interface WikiStatAppProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Component: any;
	pageProps: Partial<CommonPageProps>;
}

export class WikiStatApp extends React.Component<WikiStatAppProps> {
	render(): JSX.Element {
		return <this.props.Component {...this.props.pageProps} />;
	}
}

export default WikiStatApp;
