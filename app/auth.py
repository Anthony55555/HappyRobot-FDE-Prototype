import os
from dotenv import load_dotenv
from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Load environment variables from .env file (override existing vars)
load_dotenv(override=True)

API_KEY = os.getenv("API_KEY", "")

security = HTTPBearer(auto_error=False)


async def verify_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Verify API key from either:
    - Authorization: Bearer <key>
    - X-API-Key: <key>
    """
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API_KEY not configured")

    # Check Authorization header (Bearer token)
    if credentials and credentials.credentials == API_KEY:
        return True

    # Check X-API-Key header
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key == API_KEY:
        return True

    raise HTTPException(status_code=401, detail="Invalid or missing API key")
