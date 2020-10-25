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
	protected t(group: string, key: string): string {
		return this.props.i18nProvider.t(group, key);
	}

	public render(): JSX.Element {
		return <div className={styles.pageContentContainer}>
			<Head>
				<title>{this.props.title} – {this.t("common", "siteTitle")}</title>
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
		const isDark = cookies["appBaseStyle"] !== "light";

		return <Navbar fixedToTop>
			<div className={styles.headerMargin}>
				<NavbarGroup>
					<NavbarHeading className={styles.headerTitle} onClick={this.goToMainPage}>
						{this.t("common", "siteTitle")}
					</NavbarHeading>
					<NavbarDivider />
				</NavbarGroup>

				<NavbarGroup align="right">
					<Tooltip content={this.t("common", "toogleAppBaseStyle")}>
						<Button icon={isDark ? "flash" : "moon"} minimal onClick={this.toggleAppBaseStyle} />
					</Tooltip>
					<Popover content={this.renderLanguageSelectorMenu()}>
						<Tooltip content={this.t("common", "changeLanguage")}>
							<Button icon="translate" minimal />
						</Tooltip>
					</Popover>
				</NavbarGroup>
			</div>
		</Navbar>;
	}

	private toggleAppBaseStyle = () => {
		const cookies = parseCookies();
		const newBaseStyle = cookies["appBaseStyle"] !== "light" ? "light" : "dark";

		setCookie(null, "appBaseStyle", newBaseStyle, {
			maxAge: 30 * 24 * 60 * 60,
			path: "/",
		});

		if (newBaseStyle === "dark") {
			document.querySelector("body").classList.add("bp3-dark");
		} else {
			document.querySelector("body").classList.remove("bp3-dark");
		}

		this.props.router.push(this.props.router.pathname);
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
