locals {
  projects = jsondecode(file("${path.module}/../projects.json"))
  
  # Map of secret variable references
  secret_vars = {
    TMDB_API_READ_ACCESS_TOKEN = var.tmdb_api_read_access_token
    TWILIO_ACCOUNT_SID         = var.twilio_account_sid
    TWILIO_AUTH_TOKEN          = var.twilio_auth_token
    TWILIO_SERVICE_SID         = var.twilio_service_sid
  }
}

# Create Fly.io app for each project
resource "fly_app" "projects" {
  for_each = { for p in local.projects.projects : p.name => p }
  
  name = each.value.name
  org  = "personal"
}

# Create machine for each app
resource "fly_machine" "project_machines" {
  for_each = { for p in local.projects.projects : p.name => p }
  
  app    = fly_app.projects[each.key].name
  region = "iad"
  name   = "${each.value.name}-machine"
  
  image = each.value.image
  
  services = [
    {
      protocol      = "tcp"
      internal_port = each.value.internal_port
      ports = [
        {
          port     = 80
          handlers = ["http"]
        },
        {
          port     = 443
          handlers = ["http", "tls"]
        }
      ]
    }
  ]
  
  env = merge(
    each.value.env,
    {
      for secret_key in each.value.secrets :
      secret_key => local.secret_vars[secret_key]
    }
  )
  
  vm_size = "shared-cpu-1x"
  
  auto_destroy = false
  
  guest = {
    cpu_kind  = "shared"
    cpus      = 1
    memory_mb = 256
  }
}

# Configure auto-scaling
resource "fly_app_autoscaling" "project_scaling" {
  for_each = { for p in local.projects.projects : p.name => p }
  
  app_id = fly_app.projects[each.key].id
  
  enabled       = true
  min_machines  = 0
  max_machines  = 1
  
  metrics = [
    {
      type = "requests"
    }
  ]
}
