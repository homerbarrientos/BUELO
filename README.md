# BUELO Booking System

Vercel-ready MVP built with Next.js + Supabase.

## Included
- UNO and DOS courts
- Default rate ₱300/hour
- Dynamic rate per court at `/admin`
- Operating day 4:00 AM to 4:00 AM next day
- Multiple dates and multiple hourly slots
- Live availability lookup and disabled booked slots
- Database-level duplicate booking protection
- Live total before submit
- MAYA proof-of-payment image upload

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Add environment variables from `.env.example` locally and in Vercel.
4. Run `npm install` and `npm run dev`.
5. Import this GitHub repository into Vercel.
