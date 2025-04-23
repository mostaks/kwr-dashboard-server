export interface ICreateClientArgs {
  name: string;
  suffix: string;
  password: string;
  // client logo url
  logo: string;
  // agency logo url
  agencyLogo: string;
  description: string;
  dashboardRefs: string[];
  // @deprecated
  websiteUrl: string;
}
