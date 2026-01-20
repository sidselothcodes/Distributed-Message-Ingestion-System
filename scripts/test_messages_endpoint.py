#!/usr/bin/env python3
"""
Test script to verify GET /messages endpoint works correctly
"""
import sys
sys.path.insert(0, '../backend')

import psycopg2
import os

# Database connection settings
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "messages_db")
DB_USER = os.getenv("DB_USER", "ingestor")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ingestor_pass")

def test_database_connection():
    """Test if we can connect to PostgreSQL and query messages"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            connect_timeout=5
        )

        with conn.cursor() as cursor:
            # Check total message count
            cursor.execute("SELECT COUNT(*) FROM messages")
            total_count = cursor.fetchone()[0]
            print(f"✅ Total messages in database: {total_count}")

            # Get last 5 messages
            cursor.execute("""
                SELECT id, user_id, channel_id, content, created_at, inserted_at
                FROM messages
                ORDER BY inserted_at DESC
                LIMIT 5
            """)

            rows = cursor.fetchall()
            print(f"\n📨 Last 5 messages:")
            print("-" * 80)
            for row in rows:
                print(f"ID: {row[0]} | User: {row[1]} | Channel: {row[2]}")
                print(f"Content: {row[3][:50]}...")
                print(f"Created: {row[4]} | Inserted: {row[5]}")
                print("-" * 80)

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def test_api_endpoint():
    """Test the GET /messages API endpoint"""
    import requests

    try:
        response = requests.get("http://localhost:8000/messages?limit=5", timeout=5)

        if response.status_code == 200:
            messages = response.json()
            print(f"\n✅ API endpoint working! Returned {len(messages)} messages")

            if messages:
                print("\n📨 First message from API:")
                print(messages[0])
            else:
                print("⚠️  API returned empty array - database might be empty")

            return True
        else:
            print(f"❌ API returned status {response.status_code}: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to API at http://localhost:8000")
        print("   Make sure backend is running: cd infrastructure && docker-compose up")
        return False
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

if __name__ == "__main__":
    print("=" * 80)
    print("TESTING MESSAGE RETRIEVAL")
    print("=" * 80)

    print("\n1. Testing Database Connection...")
    db_ok = test_database_connection()

    print("\n2. Testing API Endpoint...")
    api_ok = test_api_endpoint()

    print("\n" + "=" * 80)
    if db_ok and api_ok:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
        if not db_ok:
            print("   - Database connection or query failed")
        if not api_ok:
            print("   - API endpoint not working")
    print("=" * 80)
