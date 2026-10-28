resource "aws_ecs_cluster" "main" {
  name = "job-tracker-cluster"
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/job-tracker-backend"
  retention_in_days = 7
}
variable "backend_image_tag" {
  description = "Backend image tag to deploy from ECR"
  type        = string
  default     = "v1"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "job-tracker-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
    essential = true

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      { name = "PORT", value = "3000" },
      { name = "PGHOST", value = aws_db_instance.database.address },
      { name = "PGPORT", value = "5432" },
      { name = "PGDATABASE", value = "jobtracker" },
      { name = "PGUSER", value = "jobtracker_admin" },
      { name = "DB_SSL", value = "true" },
      { name = "NODE_EXTRA_CA_CERTS", value = "/app/rds-global-bundle.pem" }
    ]

    secrets = [{
      name      = "PGPASSWORD"
      valueFrom = "${aws_db_instance.database.master_user_secret[0].secret_arn}:password::"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = "eu-west-2"
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  depends_on = [
    aws_iam_role_policy_attachment.ecs_execution,
    aws_iam_role_policy.database_secret
  ]
}
variable "backend_desired_count" {
  description = "Number of backend tasks; keep at zero until setup is ready"
  type        = number
  default     = 0

  validation {
    condition = (
      var.backend_desired_count >= 0 &&
      floor(var.backend_desired_count) == var.backend_desired_count
    )
    error_message = "The task count must be a non-negative whole number."
  }
}

resource "aws_ecs_service" "backend" {
  name             = "job-tracker-backend"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.backend.arn
  launch_type      = "FARGATE"
  platform_version = "1.4.0"

  desired_count                     = var.backend_desired_count
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [
    aws_lb_listener.http,
    aws_route.public_internet,
    aws_route_table_association.public
  ]
}