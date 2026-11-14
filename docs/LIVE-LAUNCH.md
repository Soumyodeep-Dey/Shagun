# Separate live-launch checklist

This implementation rejects live payment configuration. Completing this checklist requires a separately authorized project and code changes; do not replace test keys with live keys here.

- Obtain written provider confirmation that the wedding-gifting use case is permitted and identify the correct acceptance/recipient-settlement product.
- Design compliant recipient onboarding, eligibility checks, funds flow, settlement accounting and payout failure handling with the provider. Standard Checkout does not settle automatically to arbitrary couples.
- Implement the approved live adapter, isolated credentials and provider account validation; add verified refund, dispute, reconciliation, support and duplicate-payment handling.
- Review applicable privacy, payments, tax and data-retention obligations with qualified advisers and the provider. Publish appropriate terms, privacy notices and support contacts.
- Configure production Auth SMTP/OAuth, delivery monitoring, backup/restore testing, secret rotation, database monitoring and incident response.
- Add platform WAF/CAPTCHA protections appropriate to traffic, tune the shared PostgreSQL quotas, schedule stale-counter cleanup and review trusted proxy configuration.
- Add guest-record exports, complete provider reconciliation monitoring and review retention/deletion of guest records and public photo objects.
- Verify RLS and Storage policies on hosted infrastructure and perform an independent security review, concurrency/load checks and all connected acceptance scenarios.
- Obtain explicit permission before provisioning paid resources, deploying publicly or activating live payment acceptance.
