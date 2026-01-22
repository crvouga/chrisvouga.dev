variable "fly_api_token" {
  type        = string
  sensitive   = true
  description = "Fly.io API token for authentication"
}

variable "tmdb_api_read_access_token" {
  type        = string
  sensitive   = true
  description = "TMDB API read access token"
}

variable "twilio_account_sid" {
  type        = string
  sensitive   = true
  description = "Twilio account SID"
}

variable "twilio_auth_token" {
  type        = string
  sensitive   = true
  description = "Twilio authentication token"
}

variable "twilio_service_sid" {
  type        = string
  sensitive   = true
  description = "Twilio service SID"
}
