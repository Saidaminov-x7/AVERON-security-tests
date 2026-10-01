# Security scan allowlists

No broad scanner exclusions or finding suppressions are enabled. Add a
suppression only when it is narrowly scoped and includes the finding ID,
reason, file/rule scope, creation date, and review-by date. Secret allowlists
must contain only clearly fake fixtures and must never match a real credential
or an entire file type/repository.

Origin allowlists are configured through protected environment variables, not
committed as production configuration.
