import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { sqlSupportMessages } from "@workspace/db/sql-expressions";

test("native CRM: service/property isolation, Arabic phones, pagination, dates and quick sales", {
  skip: !process.env.MARIADB_TEST_SOCKET, timeout: 60000,
}, async () => {
  const database = `crm_test_${randomBytes(6).toString("hex")}`;
  const control = createMariaDbConnection({ socketPath:process.env.MARIADB_TEST_SOCKET,user:"root" });
  let application: typeof import("@workspace/db")|undefined;
  try {
    await control.pool.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    await control.pool.query(`USE \`${database}\``);
    const tables = [
      `CREATE TABLE chalet_submissions(id INT PRIMARY KEY,name_ar VARCHAR(100))`,
      `CREATE TABLE owner_bookings(id INT PRIMARY KEY,owner_id VARCHAR(100),submission_id INT,
        client_name VARCHAR(100),client_phone VARCHAR(30),contract_signer_id VARCHAR(30),booking_date VARCHAR(30),
        duration_days INT,period VARCHAR(30),total_price DECIMAL(12,2),cancelled_at DATETIME(3),contract_signed BOOLEAN,
        insurance_fee DECIMAL(12,2),insurance_received BOOLEAN,insurance_refunded BOOLEAN,
        insurance_deducted DECIMAL(12,2),checkout_at DATETIME(3))`,
      `CREATE TABLE service_providers(id INT PRIMARY KEY,owner_id VARCHAR(100),business_name VARCHAR(100))`,
      `CREATE TABLE service_appointments(id INT PRIMARY KEY,owner_id VARCHAR(100),provider_id INT,
        client_name VARCHAR(100),client_phone VARCHAR(30),client_id_number VARCHAR(30),date_str VARCHAR(30),
        amount DECIMAL(12,2),status VARCHAR(30),duration VARCHAR(30),cancelled_at DATETIME(3),
        contract_signed BOOLEAN,insurance_amount DECIMAL(12,2),insurance_status VARCHAR(30),
        insurance_deduct_amount DECIMAL(12,2),previous_date_str VARCHAR(30),last_edited_at DATETIME(3))`,
      `CREATE TABLE quick_sales(id INT PRIMARY KEY,owner_id VARCHAR(100),provider_id INT,
        client_name VARCHAR(100),client_phone VARCHAR(30),date_str VARCHAR(30),status VARCHAR(30),total DECIMAL(12,2),
        provider_name VARCHAR(100),cancelled_at DATETIME(3),items JSON,payment_method VARCHAR(30),cancellation_reason TEXT)`,
      `CREATE TABLE owner_customers(id INT PRIMARY KEY,owner_id VARCHAR(100),phone_normalized VARCHAR(30),name VARCHAR(100))`,
      `CREATE TABLE customer_notes(id INT PRIMARY KEY,owner_id VARCHAR(100),client_phone VARCHAR(30),notes TEXT)`,
      `CREATE TABLE owner_reschedule_logs(id INT PRIMARY KEY,owner_id VARCHAR(100),booking_id INT,old_date VARCHAR(30),rescheduled_at DATETIME(3))`,
    ];
    for (const table of tables) await control.pool.query(table);
    await control.pool.query("INSERT INTO chalet_submissions VALUES(1,'عقار تجريبي')");
    await control.pool.query(`INSERT INTO owner_bookings VALUES
      (1,'fixture_owner',1,'عميل تجريبي','٠٥٠٠٠٠٠٠٠٠',NULL,'2099-01-15',2,'full_day',100,NULL,true,50,true,false,0,NULL),
      (2,'fixture_owner',1,'عميل تجريبي','0500000000',NULL,'2001-01-01',1,'full_day',200,NULL,false,0,false,false,0,NULL),
      (3,'fixture_owner',1,'عميل تجريبي','0500000000',NULL,'2099-02-30',1,'full_day',50,NULL,false,0,false,false,0,NULL),
      (4,'other_owner',1,'لا يظهر','0500000000',NULL,'2099-01-15',1,'full_day',9000,NULL,true,0,false,false,0,NULL)`);
    await control.pool.query("INSERT INTO service_providers VALUES(1,'fixture_owner','خدمة تجريبية'),(2,'other_owner','خدمة أخرى')");
    await control.pool.query(`INSERT INTO service_appointments VALUES
      (1,'fixture_owner',1,'عميل خدمة','0500000000',NULL,'2099-01-15',300,'confirmed','one_day',NULL,true,100,'held',0,'2099-01-14','2026-01-01'),
      (2,'other_owner',2,'لا يظهر','0500000000',NULL,'2099-01-15',8000,'confirmed','one_day',NULL,true,0,'held',0,NULL,NULL)`);
    await control.pool.query(`INSERT INTO quick_sales VALUES
      (1,'fixture_owner',1,'عميل بيع','0500000000','2099-01-16','completed',100,'خدمة تجريبية',NULL,?,'cash',NULL),
      (2,'fixture_owner',1,'عميل بيع','0500000000','2099-01-16','cancelled',150,'خدمة تجريبية','2026-01-01',?,'cash','تجريبي')`,
      [JSON.stringify([{name:"صنف عربي 🏠",quantity:2}]),JSON.stringify([{name:"صنف ملغى",quantity:1}])]);
    await control.pool.query("INSERT INTO owner_customers VALUES(1,'fixture_owner','0500000000','الاسم المعتمد')");
    await control.pool.query("INSERT INTO customer_notes VALUES(1,'fixture_owner','0500000000','ملاحظة تجريبية')");
    await control.pool.query(`INSERT INTO owner_reschedule_logs VALUES
      (1,'fixture_owner',1,'2099-01-13','2026-01-01'),(2,'fixture_owner',1,'2099-01-14','2026-01-01')`);
    process.env.MARIADB_TEST_DATABASE = database;
    application = await import("@workspace/db");
    const { sendCrmProfile,sendCrmHistory } = await import("./customer-history");
    const { sendCrmCustomers } = await import("./customer-directory");
    async function call(handler: (req:Request,res:Response)=>Promise<unknown>,query: Record<string,unknown>) {
      let status = 200,body: Record<string,unknown>|undefined;
      const response = {
        status(value:number) { status=value; return this; },
        setHeader() { return this; },
        json(value: Record<string,unknown>) { body=value; return this; },
      };
      await handler({user:{id:"fixture_owner"},query} as unknown as Request,response as unknown as Response);
      assert.ok(body);
      return {status,body};
    }
    const profile = await call(sendCrmProfile,{phone:"٠٥٠٠٠٠٠٠٠٠",providerId:1});
    assert.equal(profile.status,200);
    assert.equal(profile.body.totalRevenue,400);
    assert.equal(profile.body.totalBookings,1);
    assert.equal(profile.body.totalSales,2);
    assert.equal(profile.body.insuranceCount,1);
    assert.equal(profile.body.clientName,"الاسم المعتمد");
    assert.equal((await call(sendCrmProfile,{phone:"0500000000",providerId:2})).status,404);
    const directory = await call(sendCrmCustomers,{scope:"service",providerId:1,page:999,search:"٠٥٠٠٠٠٠٠٠٠"});
    assert.equal(directory.body.page,1);
    assert.equal(directory.body.total,1);
    assert.ok(Array.isArray(directory.body.items));
    assert.equal(directory.body.items[0].total_revenue,400);
    assert.deepEqual(directory.body.items[0].providers,["خدمة تجريبية"]);
    assert.equal(directory.body.items[0].has_active,true);
    const history = await call(sendCrmHistory,{phone:"0500000000",providerId:1});
    assert.equal(history.body.total,3);
    assert.ok(Array.isArray(history.body.items));
    assert.equal(history.body.items.find(row=>row.id===1 && row.record_type==="quick_sale")?.item_summary,"صنف عربي 🏠 × 2");
    const properties = await call(sendCrmHistory,{phone:"0500000000",status:"active"});
    assert.equal(properties.body.total,2,"invalid legacy dates remain conservatively active, expired stays do not");
    assert.ok(Array.isArray(properties.body.items));
    assert.equal(properties.body.items.find(row=>row.id===1)?.original_date,"2099-01-14");
    const mixed = await call(sendCrmCustomers,{scope:"all"});
    assert.equal(mixed.body.total,1);
    assert.ok(Array.isArray(mixed.body.items));
    assert.equal(mixed.body.items[0].total_revenue,750);
    assert.equal(mixed.body.items[0].source,"both");
    await control.pool.query(`CREATE TABLE chalets(id INT PRIMARY KEY,location VARCHAR(100) COLLATE utf8mb4_unicode_ci)`);
    await control.pool.query("INSERT INTO chalets VALUES(1,'بُرَيْدَة'),(2,'بـريـدة'),(3,'ﺑﺮﻳﺪﺓ'),(4,'عنيزة'),(5,'ø'),(6,'o')");
    const {cityNameMatches} = await import("../city-name");
    const city = await cityNameMatches(sql`location`,"بريدة");
    assert.deepEqual((await application.db.execute(sql`SELECT id FROM chalets WHERE ${city} ORDER BY id`)).rows.map(row=>row.id),[1,2,3]);
    const distinct = await cityNameMatches(sql`location`,"ø");
    assert.deepEqual((await application.db.execute(sql`SELECT id FROM chalets WHERE ${distinct}`)).rows.map(row=>row.id),[5]);
    await control.pool.query(`ALTER TABLE owner_bookings ADD deposit_paid DECIMAL(12,2) DEFAULT 0,
      ADD balance_collected BOOLEAN DEFAULT false,ADD revenue_amount DECIMAL(12,2)`);
    const analytics = await import("./admin-analytics-sql");
    await assert.rejects(application.db.execute(analytics.adminMonthlyBookingsSql()),"invalid dates must not silently erase revenue");
    await control.pool.query("UPDATE owner_bookings SET booking_date='2099-02-28' WHERE id=3");
    await control.pool.query(`INSERT INTO owner_bookings
      (id,owner_id,submission_id,client_name,client_phone,booking_date,duration_days,period,total_price,
       contract_signed,insurance_fee,insurance_received,insurance_refunded,insurance_deducted,deposit_paid,balance_collected)
      VALUES(5,'fixture_owner',1,'تجريبي','0500000000',CURRENT_DATE,1,'full_day',200,
        false,50,true,false,0,50,false)`);
    for (const query of [analytics.adminWeeklyBookingsSql(),analytics.adminMonthlyBookingsSql()]) {
      const rows: Array<{period:string;bookings:string;revenue:string}> =
        (await application.db.execute<{period:string;bookings:string;revenue:string}>(query)).rows;
      assert.equal(rows.length,12);
      assert.equal(rows.reduce((sum,row)=>sum+Number(row.bookings),0),1);
      assert.equal(rows.reduce((sum,row)=>sum+Number(row.revenue),0),50,"insurance and unpaid balances are not booking collections");
    }
    await control.pool.query(`CREATE TABLE subscription_plans(id INT PRIMARY KEY,slug VARCHAR(50),price DECIMAL(12,2))`);
    await control.pool.query(`CREATE TABLE owner_subscriptions(id INT PRIMARY KEY,plan VARCHAR(50),payment_status VARCHAR(30),created_at DATETIME(3))`);
    await control.pool.query("INSERT INTO subscription_plans VALUES(1,'fixture',39.95)");
    await control.pool.query("INSERT INTO owner_subscriptions VALUES(1,'fixture','paid',UTC_TIMESTAMP())");
    assert.equal((await application.db.execute(analytics.adminMonthlyRevenueSql())).rows[0]?.total,"39.95");
    await control.pool.query(`CREATE TABLE owner_support_messages(id INT PRIMARY KEY,ticket_id INT,
      author_role VARCHAR(30),body TEXT,attachment_urls JSON,created_at DATETIME(3))`);
    await control.pool.query("INSERT INTO owner_support_messages VALUES(1,1,'admin',?,?,'2026-01-01 12:30:00')",
      ["رد عربي طويل 🏠 ".repeat(30),JSON.stringify(["/objects/private-proof.pdf"])]);
    const messages = (await application.db.execute(sql`SELECT ${sqlSupportMessages(sql`1`)} AS messages`)).rows[0]?.messages;
    assert.ok(Array.isArray(messages));
    assert.equal(messages.length,1);
    assert.deepEqual(messages[0].attachment_urls,["/objects/private-proof.pdf"]);
    assert.equal(new Date(messages[0].created_at).toISOString(),"2026-01-01T12:30:00.000Z");
    const connection = await control.pool.getConnection();
    try {
      await connection.query("SET SESSION group_concat_max_len=48");
      const query = new MySqlDialect().sqlToQuery(sql`SELECT ${sqlSupportMessages(sql`1`)} AS messages`);
      await assert.rejects(connection.query(query.sql,query.params),"truncated conversations must fail, never appear empty");
      await connection.query("SET SESSION group_concat_max_len=1048576");
    } finally { connection.release(); }
  } finally {
    if (application) await application.pool.end();
    await control.pool.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await control.close();
    delete process.env.MARIADB_TEST_DATABASE;
  }
});
