from fastapi import Request, HTTPException, status


def require_admin(request: Request):
    """
    Protect admin-only API endpoints.

    The login endpoint stores the authenticated admin
    in the session. Every protected endpoint uses this
    same dependency.
    """

    admin = request.session.get("admin")

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )

    return admin