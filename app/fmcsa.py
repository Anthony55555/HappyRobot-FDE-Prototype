"""
FMCSA QCMobile API Integration

To get an API key:
1. Create a Login.gov account at https://mobile.fmcsa.dot.gov/QCDevsite/logingovInfo
2. Log in at https://mobile.fmcsa.dot.gov/QCDevsite/login
3. Go to "My WebKeys" -> "Get a new WebKey"
4. Fill out the form and get your WebKey

Set the key as environment variable: FMCSA_WEBKEY
"""

import os
import httpx
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file (override existing vars)
load_dotenv(override=True)

FMCSA_BASE_URL = "https://mobile.fmcsa.dot.gov/qc/services"
FMCSA_WEBKEY = os.getenv("FMCSA_WEBKEY", "")


async def lookup_carrier_by_mc(mc_number: str) -> dict:
    """
    Look up carrier by MC/Docket number using FMCSA QCMobile API.
    
    Returns dict with:
    - found: bool
    - carrier: dict with name, mc_number, dot_number, allowed_to_operate, etc.
    - error: str or None
    """
    if not FMCSA_WEBKEY:
        return {
            "found": False,
            "carrier": None,
            "error": "FMCSA_WEBKEY not configured - using mock mode"
        }
    
    # Clean MC number (remove "MC" prefix if present, strip whitespace)
    mc_clean = mc_number.strip().upper().replace("MC", "").replace("-", "").strip()
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try docket number endpoint first
            url = f"{FMCSA_BASE_URL}/carriers/docket-number/{mc_clean}"
            response = await client.get(url, params={"webKey": FMCSA_WEBKEY})
            
            if response.status_code == 200:
                data = response.json()
                content = data.get("content", [])
                
                if content and len(content) > 0:
                    carrier_data = content[0].get("carrier", {})
                    return {
                        "found": True,
                        "carrier": {
                            "name": carrier_data.get("legalName") or carrier_data.get("dbaName"),
                            "mc_number": mc_clean,
                            "dot_number": carrier_data.get("dotNumber"),
                            "allowed_to_operate": carrier_data.get("allowedToOperate", "N") == "Y",
                            "carrier_operation": carrier_data.get("carrierOperation", []),
                            "safety_rating": carrier_data.get("safetyRating"),
                            "safety_rating_date": carrier_data.get("safetyRatingDate"),
                            "total_drivers": carrier_data.get("totalDrivers"),
                            "total_power_units": carrier_data.get("totalPowerUnits"),
                            "physical_address": {
                                "street": carrier_data.get("phyStreet"),
                                "city": carrier_data.get("phyCity"),
                                "state": carrier_data.get("phyState"),
                                "zip": carrier_data.get("phyZipcode"),
                                "country": carrier_data.get("phyCountry"),
                            },
                            "raw": carrier_data  # Include raw data for debugging
                        },
                        "error": None
                    }
                else:
                    return {
                        "found": False,
                        "carrier": None,
                        "error": f"No carrier found with MC number {mc_clean}"
                    }
            else:
                return {
                    "found": False,
                    "carrier": None,
                    "error": f"FMCSA API error: {response.status_code}"
                }
                
    except httpx.TimeoutException:
        return {
            "found": False,
            "carrier": None,
            "error": "FMCSA API timeout"
        }
    except Exception as e:
        return {
            "found": False,
            "carrier": None,
            "error": f"FMCSA API error: {str(e)}"
        }


def is_carrier_eligible(carrier_data: dict) -> tuple[bool, Optional[str]]:
    """
    Determine if a carrier is eligible to work with based on FMCSA data.
    
    Returns (eligible: bool, reason: str or None)
    """
    if not carrier_data:
        return False, "Carrier not found in FMCSA database"
    
    # Check if allowed to operate
    if not carrier_data.get("allowed_to_operate"):
        return False, "Carrier is not authorized to operate"
    
    # Check for satisfactory safety rating (if available)
    safety_rating = carrier_data.get("safety_rating")
    if safety_rating and safety_rating.upper() == "UNSATISFACTORY":
        return False, "Carrier has unsatisfactory safety rating"
    
    # Add more eligibility checks as needed:
    # - Insurance verification
    # - Operating authority type
    # - Equipment types
    
    return True, None
