import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface BirthdayRow {
  workerName: string;
  birthDate: Date;
}

export async function GET() {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    const birthdays = await prisma.$queryRaw<BirthdayRow[]>`
      SELECT
        "Worker_name" AS "workerName",
        "Birth_date"  AS "birthDate"
      FROM "Workers"
      WHERE EXTRACT(MONTH FROM "Birth_date") = ${currentMonth}
        AND UPPER("User_type") IN ('1', 'W', 'C')
      ORDER BY EXTRACT(DAY FROM "Birth_date") ASC;
    `;

    const formatted = birthdays.map((item) => {
      const birthdate = new Date(item.birthDate);
      const day = birthdate.getDate().toString().padStart(2, '0');
      const month = (birthdate.getMonth() + 1).toString().padStart(2, '0');

      return {
        name: item.workerName,
        date: `${day}/${month}`,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching birthdays:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch birthdays data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
