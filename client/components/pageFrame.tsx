import { Button, Icon, IconName, Menu, MenuItem, Navbar, NavbarDivider, NavbarGroup, NavbarHeading, Popover, Tooltip } from "@blueprintjs/core";
import Head from "next/head";
import { NextRouter } from "next/router";
import { parseCookies, setCookie } from "nookies";
import * as React from "react";
import { SupportedLanguages } from "../../common/interfaces/I18nCommon";
import { I18nProvider } from "../helpers/i18nClient";
import styles from "./pageFrame.module.scss";

interface PageFrameProps {
	title: string;
	icon: IconName;
	children?: React.ReactNode;

	router: NextRouter;
	i18nProvider: I18nProvider;
}

export class PageFrame extends React.Component<PageFrameProps> {
	protected t(key: string): string {
		return this.props.i18nProvider.t(key);
	}

	public render(): JSX.Element {
		return <div className={styles.pageContentContainer}>
			<Head>
				<title>{this.props.title} – {this.t("siteTitle")}</title>
			</Head>
			{this.renderNavbar()}
			<h2 className={styles.pageTitle}>
				<Icon className={styles.pageTitleIcon} icon={this.props.icon} iconSize={24} />
				<span className={styles.pageTitleContent}>{this.props.title}</span>
			</h2>
			{this.props.children}
		</div>;
	}

	private renderNavbar() {
		const cookies = parseCookies();

		return <Navbar fixedToTop>
			<div className={styles.headerMargin}>
				<NavbarGroup>
					<NavbarHeading className={styles.headerTitle} onClick={this.goToMainPage}>
						{this.t("siteTitle")}
					</NavbarHeading>
					<NavbarDivider />
				</NavbarGroup>

				<NavbarGroup align="right">
					<Popover content={this.renderLanguageSelectorMenu()}>
						<Tooltip content={this.t("changeLanguage")}>
							<Button icon="translate" minimal />
						</Tooltip>
					</Popover>
				</NavbarGroup>
			</div>
		</Navbar>;
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
			setCookie(null, "languageCode", languageCode, {
				maxAge: 30 * 24 * 60 * 60,
				path: "/",
			});
			this.props.router.reload();
		};
	}
}
