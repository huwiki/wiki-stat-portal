import { CommonPageProps } from "../../common/interfaces/commonPageProps";

export interface GetPortalServerSidePropsResult<T extends CommonPageProps> {
	props: Partial<T>;
}
