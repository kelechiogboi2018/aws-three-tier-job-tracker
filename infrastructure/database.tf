resource "aws_db_subnet_group" "database" {
  name        = "job-tracker-database"
  description = "Private subnets for the job tracker database"

  subnet_ids = aws_subnet.database[*].id

  tags = {
    Name = "job-tracker-database-subnets"
  }
}
resource "aws_db_instance" "database" {
  identifier     = "job-tracker-db"
  engine         = "postgres"
  engine_version = "17.11"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name                     = "jobtracker"
  username                    = "jobtracker_admin"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.database.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1
  deletion_protection     = false
  skip_final_snapshot     = true

  tags = {
    Name = "job-tracker-db"
  }
}