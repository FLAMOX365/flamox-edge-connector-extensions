# SQL Server Read-only

Executes only named queries stored in the reviewed installation configuration.
An action selects a query name and supplies exactly the declared parameters; it
cannot submit SQL text or change the server. Statements are restricted to one
`SELECT` or `WITH` statement and the driver requests a read-only connection.

The database account must still be granted read-only permissions by the
customer. The extension-side statement check is defense in depth, not a
substitute for SQL Server authorization. Returned rows are capped by the
configured limit.
