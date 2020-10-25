import { CommonPageProps } from "../../helpers/client/commonPageProps";

export interface GetServerSidePropsResult<T extends CommonPageProps> {
	props: Partial<T>;
}
