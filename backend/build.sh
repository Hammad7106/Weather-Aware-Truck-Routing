#!/usr/bin/env bash
# Render build step for the Django API.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
