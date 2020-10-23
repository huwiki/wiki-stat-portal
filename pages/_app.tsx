import "../styles/globals.scss";
import * as React from "react";
import "normalize.css/normalize.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import { Button, Navbar, NavbarDivider, NavbarGroup, NavbarHeading } from "@blueprintjs/core";

interface WikiStatAppProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Component: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	pageProps: any;
}

function WikiStatApp(props: WikiStatAppProps): JSX.Element {
	return <>
		<Navbar fixedToTop>
			<NavbarGroup>
				<NavbarHeading className="headerTitle">WikiStatPortal</NavbarHeading>
				<NavbarDivider />
				<Button minimal text="Funnel" icon="filter" />
			</NavbarGroup>
		</Navbar>
		<props.Component {...props.pageProps} />
	</>;
}

export default WikiStatApp;
