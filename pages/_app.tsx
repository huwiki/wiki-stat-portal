import { Button, Menu, MenuItem, Navbar, NavbarDivider, NavbarGroup, NavbarHeading, Popover, Tooltip } from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import { Cookie, withCookie } from "next-cookie";
import { AppContextType } from "next/dist/next-server/lib/utils";
import { NextRouter, withRouter } from "next/router";
import "normalize.css/normalize.css";
import * as React from "react";
import { getLocalizedText } from "../helpers/i18nClient";
import { SupportedLanguages } from "../helpers/I18nCommon";
import commonStyles from "../styles/common.module.scss";
import "../styles/globals.scss";
import { CommonPageProps } from "./commonPageProps";

interface WikiStatAppProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Component: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	pageProps: Partial<CommonPageProps>;
	router: NextRouter;
	cookie: Cookie;
}

export class WikiStatApp extends React.Component<WikiStatAppProps> {
	protected t(group: string, key: string): string {
		return getLocalizedText(this.props.pageProps.i18nData, group, key);
	}

	render(): JSX.Element {
		return <>
			<Navbar fixedToTop>
				<div className={commonStyles.headerMargin}>
					<NavbarGroup>
						<NavbarHeading className={commonStyles.headerTitle} onClick={this.goToMainPage}>
							{this.t("common", "siteTitle")}
						</NavbarHeading>
						<NavbarDivider />
					</NavbarGroup>
					<NavbarGroup align="right">
						<Popover content={this.renderLanguageSelectorMenu()}>
							<Tooltip content={this.t("common", "changeLanguage")}>
								<Button icon="translate" minimal />
							</Tooltip>
						</Popover>
					</NavbarGroup>
				</div>
			</Navbar>
			<div className={commonStyles.pageContentContainer}>
				<this.props.Component {...this.props.pageProps} />
			</div>
		</>;
	}

	private renderLanguageSelectorMenu(): JSX.Element {
		return <Menu>
			{SupportedLanguages.map(x => <MenuItem
				key={x.languageCode}
				text={x.nativeName}
				label={x.name}
				onClick={this.setLanguage(x.languageCode)} />)}
		</Menu>;
	}

	private goToMainPage = () => {
		this.props.router.push("/");
	};

	private setLanguage = (languageCode: string) => {
		return () => {
			this.props.cookie.set("languageCode", languageCode);
			this.props.router.push(this.props.router.pathname);
		};
	}

	static async getInitialProps(appContext: AppContextType): Promise<Partial<WikiStatAppProps>> {
		let subPageProps: Partial<CommonPageProps> = {};
		if (appContext.Component.getInitialProps) {
			subPageProps = await appContext.Component.getInitialProps(appContext.ctx);
		}

		return {
			pageProps: subPageProps,
		};
	}
}

export default withCookie(withRouter(WikiStatApp));
