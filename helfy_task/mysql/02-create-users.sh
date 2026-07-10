#!/bin/bash
# This script creates the necessary MySQL users and grants them the appropriate privileges for the application and Debezium replication.
# IMPORTENT !!! the MySQL entrypoint sources this file (rather than executing it in a
# subprocess), so `set -euo pipefail` here would leak into the entrypoint's own
# shell and crash it later on unrelated unset variables. it must be scoped to a
# subshell instead.
(
  set -euo pipefail

  mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
    CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
    GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${APP_DB_USER}'@'%';

    CREATE USER IF NOT EXISTS '${DEBEZIUM_DB_USER}'@'%' IDENTIFIED BY '${DEBEZIUM_DB_PASSWORD}';
    GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT
      ON *.* TO '${DEBEZIUM_DB_USER}'@'%';

    FLUSH PRIVILEGES;
SQL
)
