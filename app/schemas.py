"""
Pydantic schemas for the Voice Workflow Builder API.

These models define the structure of loads, requests, and responses.
"""

from typing import Optional, Union
from pydantic import BaseModel, Field


class Load(BaseModel):
    """
    Load schema matching the FDE Technical Challenge requirements.
    
    All fields follow the exact naming convention required for the workflow builder.
    """
    
    load_id: str = Field(
        ...,
        description="Unique identifier for the load"
    )
    
    origin: str = Field(
        ...,
        description="Starting location (city, state)"
    )
    
    destination: str = Field(
        ...,
        description="Delivery location (city, state)"
    )
    
    pickup_datetime: str = Field(
        ...,
        description="ISO 8601 datetime string for pickup"
    )
    
    delivery_datetime: str = Field(
        ...,
        description="ISO 8601 datetime string for delivery"
    )
    
    equipment_type: str = Field(
        ...,
        description="Type of equipment needed (e.g., Dry Van, Reefer, Flatbed)"
    )
    
    loadboard_rate: float = Field(
        ...,
        description="Listed rate for the load in USD"
    )
    
    notes: Optional[str] = Field(
        None,
        description="Additional information about the load"
    )
    
    weight: Optional[int] = Field(
        None,
        description="Load weight in pounds"
    )
    
    commodity_type: Optional[str] = Field(
        None,
        description="Type of goods being transported"
    )
    
    num_of_pieces: Optional[int] = Field(
        None,
        description="Number of items/pallets/pieces"
    )
    
    miles: Optional[int] = Field(
        None,
        description="Distance to travel in miles"
    )
    
    dimensions: Optional[str] = Field(
        None,
        description="Size measurements (e.g., '53x102', length x width)"
    )


class LoadsResponse(BaseModel):
    """Response model for search_loads endpoint."""
    loads: list[Load] = Field(
        ...,
        description="List of matching loads"
    )


class SubmitLoadRequest(BaseModel):
    """Submit a load for a call (e.g. from TMS/load board). All load fields optional except call_id."""
    call_id: str = Field(..., description="Call this load is offered for")
    load_id: Optional[str] = Field(None, description="Unique identifier for the load")
    origin: Optional[str] = Field(None, description="Starting location (city, state)")
    destination: Optional[str] = Field(None, description="Delivery location (city, state)")
    pickup_datetime: Optional[str] = Field(None, description="ISO 8601 datetime for pickup")
    delivery_datetime: Optional[str] = Field(None, description="ISO 8601 datetime for delivery")
    equipment_type: Optional[str] = Field(None, description="Type of equipment needed")
    loadboard_rate: Optional[float] = Field(None, description="Listed rate for the load in USD")
    rate: Optional[float] = Field(None, description="Alias for loadboard_rate")
    notes: Optional[str] = Field(None, description="Additional information about the load")
    weight: Optional[int] = Field(None, description="Load weight in pounds")
    commodity_type: Optional[str] = Field(None, description="Type of goods")
    num_of_pieces: Optional[int] = Field(None, description="Number of items/pallets/pieces")
    miles: Optional[int] = Field(None, description="Distance to travel in miles")
    dimensions: Optional[str] = Field(None, description="Size measurements (e.g. '53x102')")


class SearchLoadsRequest(BaseModel):
    """Request model for searching loads."""
    origin: Optional[str] = Field(
        None,
        description="Filter by starting location"
    )
    destination: Optional[str] = Field(
        None,
        description="Filter by delivery location"
    )
    equipment_type: Optional[str] = Field(
        None,
        description="Filter by equipment type"
    )
    min_rate: Optional[float] = Field(
        None,
        description="Minimum rate threshold"
    )
    max_weight: Optional[int] = Field(
        None,
        description="Maximum weight capacity"
    )


class VerifyCarrierRequest(BaseModel):
    """Request model for carrier verification."""
    mc_number: str = Field(
        ...,
        description="Motor Carrier (MC) number to verify"
    )


class VerifyCarrierResponse(BaseModel):
    """Response model for carrier verification."""
    eligible: bool = Field(
        ...,
        description="Whether the carrier is eligible to work with"
    )
    carrier: dict = Field(
        ...,
        description="Carrier information from FMCSA"
    )
    reason: Optional[str] = Field(
        None,
        description="Reason for ineligibility (if applicable)"
    )


class NegotiateRequest(BaseModel):
    """Request model for rate negotiation."""
    load_id: str = Field(
        ...,
        description="Load identifier being negotiated"
    )
    loadboard_rate: float = Field(
        ...,
        description="The posted/listed rate"
    )
    carrier_counter: float = Field(
        ...,
        description="Carrier's counter offer amount"
    )
    round: int = Field(
        ...,
        description="Current negotiation round (1-3)"
    )


class NegotiateResponse(BaseModel):
    """Response model for negotiation."""
    decision: str = Field(
        ...,
        description="Decision: 'accept', 'counter', or 'reject'"
    )
    next_offer: Optional[float] = Field(
        None,
        description="Next offer amount (if decision is accept or counter)"
    )
    message: str = Field(
        ...,
        description="Message to relay to the carrier"
    )


class LogEventRequest(BaseModel):
    """Request model for event logging."""
    call_id: Optional[str] = Field(
        None,
        description="Unique call identifier"
    )
    event_type: Optional[str] = Field(
        None,
        description="Type of event being logged"
    )
    payload: Optional[dict] = Field(
        None,
        description="Event-specific data"
    )


class CallOutputRequest(BaseModel):
    """Request model for final call output logging (echoed back)."""
    call_id: str = Field(..., description="Unique call identifier")
    event_type: str = Field(..., description="Type of event being logged")
    payload: Union[dict, str] = Field(..., description="Event-specific data (object or JSON string)")


class VerifyMcRequest(BaseModel):
    """Request model for FMCSA MC verification."""
    call_id: str = Field(..., description="Unique call identifier")
    mc_number: str = Field(..., description="Motor Carrier (MC) number to verify")


class VerifyMcResponse(BaseModel):
    """Response model for FMCSA MC verification."""
    ok: bool = Field(..., description="Request successful")
    eligible: bool = Field(..., description="Whether the carrier is eligible")
    reason: Optional[str] = Field(None, description="Reason for ineligibility")
    carrier: Optional[dict] = Field(None, description="Carrier information from FMCSA")
    raw: Optional[dict] = Field(None, description="Raw FMCSA response data")


class HandoffContextRequest(BaseModel):
    """Request model for call handoff context."""
    call_id: str = Field(..., description="Unique call identifier")
    carrier_name: Optional[str] = Field(None, description="Carrier company name")
    mc_number: Optional[str] = Field(None, description="MC number")
    load_id: Optional[str] = Field(None, description="Load being discussed")
    agreed_rate: Optional[float] = Field(None, description="Agreed upon rate")
    origin: Optional[str] = Field(None, description="Load origin")
    destination: Optional[str] = Field(None, description="Load destination")
    pickup_datetime: Optional[str] = Field(None, description="Pickup time")
    notes: Optional[str] = Field(None, description="Additional context notes")


class SendHandoffEmailRequest(BaseModel):
    """Request to email a sales rep the handoff summary for a call."""
    call_id: str = Field(..., description="Unique call identifier")
    to_email: str = Field(..., description="Sales rep email address")
    subject: Optional[str] = Field(None, description="Email subject (default: handoff summary subject)")


class ClassifyCallRequest(BaseModel):
    """Request model for call classification."""
    call_id: str = Field(..., description="Unique call identifier")
    outcome: str = Field(
        ...,
        description="Call outcome: 'booked', 'declined', 'no_match', 'transferred', 'abandoned'"
    )
    sentiment: str = Field(
        ...,
        description="Carrier sentiment: 'positive', 'neutral', 'negative', 'frustrated'"
    )
    tone: Optional[str] = Field(
        None,
        description="Caller tone (e.g. friendly, flat, annoyed, rushed). Use with transcript for better sentiment."
    )
    sentiment_reasoning: Optional[str] = Field(
        None,
        description="Why this sentiment was chosen (e.g. transcript + tone)."
    )
    carrier_mc: Optional[str] = Field(None, description="Carrier MC number")
    load_id: Optional[str] = Field(None, description="Load discussed")
    final_rate: Optional[float] = Field(None, description="Final agreed rate")
    negotiation_rounds: Optional[int] = Field(None, description="Number of negotiation rounds")
    call_duration_seconds: Optional[int] = Field(None, description="Call duration in seconds")
    summary: Optional[str] = Field(None, description="Call summary")


class SetCarrierPrefsRequest(BaseModel):
    """Request model for setting carrier preferences."""
    mc_number: str = Field(..., description="Motor Carrier number")
    home_city: Optional[str] = Field(None, description="Home city")
    home_state: Optional[str] = Field(None, description="Home state")
    home_lat: Optional[Union[str, float]] = Field(None, description="Home latitude")
    home_lng: Optional[Union[str, float]] = Field(None, description="Home longitude")
    equipment_type: Optional[str] = Field(None, description="Equipment type (VAN, REEFER, FLATBED)")
    min_temp: Optional[Union[str, float]] = Field(None, description="Minimum temperature (accepts string or number)")
    max_temp: Optional[Union[str, float]] = Field(None, description="Maximum temperature (accepts string or number)")
    origin_radius_miles: Optional[Union[str, int]] = Field(None, description="Origin search radius in miles")
    dest_radius_miles: Optional[Union[str, int]] = Field(None, description="Destination search radius in miles")


class SetCallSearchPrefsRequest(BaseModel):
    """Request model for setting call search preferences."""
    call_id: str = Field(..., description="Unique call identifier")
    mc_number: Optional[str] = Field(None, description="Motor Carrier number")
    origin_city: Optional[str] = Field(None, description="Origin city")
    origin_state: Optional[str] = Field(None, description="Origin state")
    destination_city: Optional[str] = Field(None, description="Destination city")
    destination_state: Optional[str] = Field(None, description="Destination state")
    pickup_date: Optional[str] = Field(None, description="Pickup date (ISO 8601)")
    departure_date: Optional[str] = Field(None, description="Earliest departure date - when carrier is leaving current location (ISO 8601)")
    latest_departure_date: Optional[str] = Field(None, description="Latest departure date - flexibility window (ISO 8601)")
    equipment_type: Optional[str] = Field(None, description="Equipment type")
    weight_capacity: Optional[Union[str, int]] = Field(None, description="Weight capacity in pounds (accepts string or number)")
    origin_lat: Optional[Union[str, float]] = Field(None, description="Origin latitude")
    origin_lng: Optional[Union[str, float]] = Field(None, description="Origin longitude")
    origin_radius_miles: Optional[Union[str, int]] = Field(None, description="Origin search radius in miles")
    dest_lat: Optional[Union[str, float]] = Field(None, description="Destination latitude")
    dest_lng: Optional[Union[str, float]] = Field(None, description="Destination longitude")
    dest_radius_miles: Optional[Union[str, int]] = Field(None, description="Destination search radius in miles")
    min_temp: Optional[Union[str, float]] = Field(None, description="Minimum temperature (accepts string or number)")
    max_temp: Optional[Union[str, float]] = Field(None, description="Maximum temperature (accepts string or number)")
    notes: Optional[str] = Field(None, description="Additional notes or special requirements")


class GetBestLoadRequest(BaseModel):
    """Request model for getting the best load for negotiation."""
    call_id: str = Field(..., description="Unique call identifier")
