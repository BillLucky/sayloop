"""Reset a local user's password with an interactive prompt; revoke their sessions."""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import accounts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username")
    args = parser.parse_args()
    password = getpass.getpass("New password (at least 10 characters): ")
    if len(password) < 10 or len(password) > 200:
        parser.error("Use 10 to 200 characters.")
    if password != getpass.getpass("Confirm password: "):
        parser.error("Passwords do not match.")
    with accounts.database() as db:
        user = db.execute("SELECT id FROM users WHERE username=?", (args.username,)).fetchone()
        if not user:
            parser.error("User not found. Start the server once to provision the owner.")
        db.execute(
            "UPDATE users SET password=? WHERE id=?", (accounts.password_hash(password), user["id"])
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    print("Password updated; existing sessions revoked.")


if __name__ == "__main__":
    main()
