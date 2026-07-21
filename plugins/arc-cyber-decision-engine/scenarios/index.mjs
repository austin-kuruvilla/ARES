import { oauthPhishingScenario } from "./oauth-phishing.mjs";
import { oauthPhishingEndpointMalwareScenario } from "./oauth-phishing-endpoint-malware.mjs";
import { oktaAwsSessionHijackScenario } from "./okta-aws-session-hijack.mjs";
import { githubActionsSecretTheftScenario } from "./github-actions-secret-theft.mjs";
import { ransomwareBackupThreatScenario } from "./ransomware-backup-threat.mjs";
import { salesforceConnectedAppExfiltrationScenario } from "./salesforce-connected-app-exfiltration.mjs";
import { snowflakeKeyExfiltrationScenario } from "./snowflake-key-exfiltration.mjs";
import { kubernetesServiceAccountAbuseScenario } from "./kubernetes-service-account-abuse.mjs";
import { workdayPayrollRoutingChangeScenario } from "./workday-payroll-routing-change.mjs";
import { gcpBigQueryKeyLeakScenario } from "./gcp-bigquery-key-leak.mjs";
import { slackTokenCompromiseScenario } from "./slack-token-compromise.mjs";

export const scenarios = [
  oauthPhishingScenario,
  oauthPhishingEndpointMalwareScenario,
  oktaAwsSessionHijackScenario,
  githubActionsSecretTheftScenario,
  ransomwareBackupThreatScenario,
  salesforceConnectedAppExfiltrationScenario,
  snowflakeKeyExfiltrationScenario,
  kubernetesServiceAccountAbuseScenario,
  workdayPayrollRoutingChangeScenario,
  gcpBigQueryKeyLeakScenario,
  slackTokenCompromiseScenario,
];
