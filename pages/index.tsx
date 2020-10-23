import { Button, Card, Icon } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withCookie } from "next-cookie";
import { withRouter } from "next/router";
import * as React from "react";
import { NextBasePage } from "../helpers/nextBasePage";
import { PageFrame } from "../modules/pageFrame";
import indexPageStyles from "../styles/indexPage.module.scss";
import { CommonPageProps, ModuleDescriptor } from "./commonPageProps";

const REQUIRED_LANGUAGE_GROUPS = [
	"common",
	"index"
];

class IndexPage extends NextBasePage<CommonPageProps> {
	public render(): JSX.Element {
		return <PageFrame icon="application" title={this.t("index", "title")}>
			<p>{this.t("index", "description")}</p>
			<div className={indexPageStyles.moduleCardList}>
				{this.props.availableModules.map(x => this.renderModuleDetails(x))}
			</div>
		</PageFrame>;
	}

	private renderModuleDetails(module: ModuleDescriptor) {
		return <Card className="moduleCard" key={module.id}>
			<Icon className="moduleCardIcon" icon={module.icon} iconSize={96} />
			<h3>{this.t("common", `module.${module.id}`)}</h3>
			<p>{this.t("common", `module.${module.id}.description`)}</p>
			<Button text={this.t("common", "button.go")} rightIcon="caret-right" onClick={this.goToModulePage(module.id)} />
		</Card>;
	}

	private goToModulePage(moduleId: string) {
		return () => {
			this.props.router.push(`/modules/${moduleId}`);
		};
	}

	public static getInitialProps = async (ctx: NextPageContext): Promise<Partial<CommonPageProps>> => {
		return NextBasePage.withCommonInitialProps<CommonPageProps>(ctx, {}, REQUIRED_LANGUAGE_GROUPS);
	}
}

export default withRouter(withCookie(IndexPage));
