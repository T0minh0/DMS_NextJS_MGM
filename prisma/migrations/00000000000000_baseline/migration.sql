-- Baseline for the existing DMS_NextJS_MGM Prisma schema.
-- Generated from `prisma/schema.prisma` with:
-- DATABASE_URL='postgresql://user:pass@localhost:5432/dms?schema=public' \
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- CreateTable
CREATE TABLE "Cooperative" (
    "cooperative_id" BIGSERIAL NOT NULL,
    "cooperative_name" TEXT NOT NULL,

    CONSTRAINT "Cooperative_pkey" PRIMARY KEY ("cooperative_id")
);

-- CreateTable
CREATE TABLE "Devices" (
    "device_id" BIGSERIAL NOT NULL,
    "cooperative_id" BIGINT NOT NULL,

    CONSTRAINT "Devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "Groups" (
    "Group_id" BIGSERIAL NOT NULL,
    "Group_name" TEXT NOT NULL,

    CONSTRAINT "Groups_pkey" PRIMARY KEY ("Group_id")
);

-- CreateTable
CREATE TABLE "Materials" (
    "Material_id" BIGSERIAL NOT NULL,
    "Material_name" TEXT NOT NULL,
    "Material_group" BIGINT,

    CONSTRAINT "Materials_pkey" PRIMARY KEY ("Material_id")
);

-- CreateTable
CREATE TABLE "Buyers" (
    "Buyer_id" BIGSERIAL NOT NULL,
    "Buyer_name" TEXT NOT NULL,

    CONSTRAINT "Buyers_pkey" PRIMARY KEY ("Buyer_id")
);

-- CreateTable
CREATE TABLE "Sales" (
    "Sale_id" BIGSERIAL NOT NULL,
    "Date" DATE NOT NULL,
    "Material" BIGINT NOT NULL,
    "Weight" DECIMAL(10,2) NOT NULL,
    "Price_Kg" DECIMAL(10,2) NOT NULL,
    "Buyer" BIGINT NOT NULL,
    "Responsible" BIGINT NOT NULL,

    CONSTRAINT "Sales_pkey" PRIMARY KEY ("Sale_id")
);

-- CreateTable
CREATE TABLE "Workers" (
    "Worker_id" BIGSERIAL NOT NULL,
    "Worker_name" TEXT NOT NULL,
    "Cooperative" BIGINT NOT NULL,
    "CPF" BYTEA NOT NULL,
    "User_type" CHAR(1) NOT NULL,
    "Birth_date" DATE NOT NULL,
    "Enter_date" DATE NOT NULL,
    "Exit_date" DATE,
    "PIS" BYTEA NOT NULL,
    "RG" BYTEA NOT NULL,
    "Gender" TEXT,
    "Password" BYTEA NOT NULL,
    "Email" TEXT NOT NULL,
    "Last_update" DATE,

    CONSTRAINT "Workers_pkey" PRIMARY KEY ("Worker_id")
);

-- CreateTable
CREATE TABLE "Measurments" (
    "Weighting_id" BIGSERIAL NOT NULL,
    "Weight_KG" DECIMAL(10,2) NOT NULL,
    "Time_stamp" DATE NOT NULL,
    "Wastepicker" BIGINT NOT NULL,
    "Material" BIGINT NOT NULL,
    "Device" BIGINT NOT NULL,
    "Bag_filled" BOOLEAN NOT NULL,

    CONSTRAINT "Measurments_pkey" PRIMARY KEY ("Weighting_id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "Stock_id" BIGSERIAL NOT NULL,
    "Cooperative" BIGINT NOT NULL,
    "Material" BIGINT NOT NULL,
    "Total_collected_KG" DECIMAL(65,2) NOT NULL,
    "Total_sold_KG" DECIMAL(65,2) NOT NULL,
    "Current_stock_KG" DECIMAL(45,2) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("Stock_id")
);

-- CreateTable
CREATE TABLE "Worker_contributions" (
    "Contribution_id" BIGSERIAL NOT NULL,
    "Wastepicker" BIGINT NOT NULL,
    "Material" BIGINT NOT NULL,
    "cooperative" BIGINT NOT NULL,
    "Period" daterange NOT NULL,
    "Weight_KG" DECIMAL(15,2) NOT NULL,
    "Last_updated" DATE,

    CONSTRAINT "Worker_contributions_pkey" PRIMARY KEY ("Contribution_id")
);

-- AddForeignKey
ALTER TABLE "Devices" ADD CONSTRAINT "Cooperative_id" FOREIGN KEY ("cooperative_id") REFERENCES "Cooperative"("cooperative_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materials" ADD CONSTRAINT "Material_group" FOREIGN KEY ("Material_group") REFERENCES "Groups"("Group_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sales" ADD CONSTRAINT "Material" FOREIGN KEY ("Material") REFERENCES "Materials"("Material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sales" ADD CONSTRAINT "Buyer" FOREIGN KEY ("Buyer") REFERENCES "Buyers"("Buyer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sales" ADD CONSTRAINT "Responsible" FOREIGN KEY ("Responsible") REFERENCES "Workers"("Worker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workers" ADD CONSTRAINT "cooperative" FOREIGN KEY ("Cooperative") REFERENCES "Cooperative"("cooperative_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurments" ADD CONSTRAINT "wastepicker" FOREIGN KEY ("Wastepicker") REFERENCES "Workers"("Worker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurments" ADD CONSTRAINT "Material" FOREIGN KEY ("Material") REFERENCES "Materials"("Material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurments" ADD CONSTRAINT "Device" FOREIGN KEY ("Device") REFERENCES "Devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Cooperative" FOREIGN KEY ("Cooperative") REFERENCES "Cooperative"("cooperative_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Material" FOREIGN KEY ("Material") REFERENCES "Materials"("Material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker_contributions" ADD CONSTRAINT "Wastepicker" FOREIGN KEY ("Wastepicker") REFERENCES "Workers"("Worker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker_contributions" ADD CONSTRAINT "Material" FOREIGN KEY ("Material") REFERENCES "Materials"("Material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker_contributions" ADD CONSTRAINT "Cooperative" FOREIGN KEY ("cooperative") REFERENCES "Cooperative"("cooperative_id") ON DELETE RESTRICT ON UPDATE CASCADE;
