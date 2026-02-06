#!/usr/bin/env python3
"""
Basic usage example for Gemini-Ollama Bridge

This example shows how to use the bridge with the Ollama Python client
or direct HTTP requests.

Requirements:
    pip install ollama requests

Usage:
    python basic_usage.py
"""

import json
import requests
from typing import List, Dict, Any, Optional

OLLAMA_URL = "http://localhost:11434"


def list_models() -> List[Dict[str, Any]]:
    """List available models from the bridge."""
    print("=== Listing Available Models ===")
    
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags")
        response.raise_for_status()
        data = response.json()
        
        print("Available models:")
        for model in data.get("models", []):
            print(f"  - {model['name']} ({model['details']['family']})")
        
        return data.get("models", [])
    except requests.exceptions.RequestException as e:
        print(f"Error listing models: {e}")
        return []


def generate_completion(
    model: str = "gemini-flash",
    prompt: str = "Explain quantum computing in simple terms:",
    stream: bool = False,
    temperature: float = 0.7
) -> Optional[Dict[str, Any]]:
    """Generate a text completion."""
    print("\n=== Generating Completion ===")
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": stream,
                "options": {
                    "temperature": temperature,
                },
            },
            stream=stream
        )
        response.raise_for_status()
        
        if stream:
            print("Streaming response:")
            full_response = ""
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if data.get("response"):
                            print(data["response"], end="", flush=True)
                            full_response += data["response"]
                        if data.get("done"):
                            print("\n[Stream complete]")
                            return data
                    except json.JSONDecodeError:
                        pass
            return {"response": full_response}
        else:
            data = response.json()
            print(f"Response: {data['response']}")
            print(f"Model: {data['model']}")
            print(f"Tokens: {data.get('eval_count', 'N/A')}")
            return data
            
    except requests.exceptions.RequestException as e:
        print(f"Error generating completion: {e}")
        return None


def chat_completion(
    model: str = "gpt-4o-mini",
    messages: List[Dict[str, str]] = None,
    stream: bool = False
) -> Optional[Dict[str, Any]]:
    """Generate a chat completion."""
    print("\n=== Chat Completion ===")
    
    if messages is None:
        messages = [
            {"role": "system", "content": "You are a helpful coding assistant."},
            {"role": "user", "content": "How do I reverse a string in Python?"},
        ]
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": stream,
            },
            stream=stream
        )
        response.raise_for_status()
        
        if stream:
            print("Streaming response:")
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if data.get("message", {}).get("content"):
                            print(data["message"]["content"], end="", flush=True)
                        if data.get("done"):
                            print("\n[Stream complete]")
                            return data
                    except json.JSONDecodeError:
                        pass
        else:
            data = response.json()
            print(f"Assistant: {data['message']['content']}")
            return data
            
    except requests.exceptions.RequestException as e:
        print(f"Error in chat completion: {e}")
        return None


def generate_embeddings(
    text: str = "The quick brown fox jumps over the lazy dog",
    model: str = "gemini-flash"
) -> Optional[List[List[float]]]:
    """Generate embeddings for text."""
    print("\n=== Generating Embeddings ===")
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/embed",
            json={
                "model": model,
                "input": text,
            }
        )
        response.raise_for_status()
        
        data = response.json()
        embeddings = data.get("embeddings", [])
        
        if embeddings:
            print(f"Embedding dimensions: {len(embeddings[0])}")
            print(f"First 5 values: {embeddings[0][:5]}")
        
        return embeddings
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating embeddings: {e}")
        return None


def health_check() -> Optional[Dict[str, Any]]:
    """Check the health status of the bridge."""
    print("\n=== Health Check ===")
    
    try:
        response = requests.get(f"{OLLAMA_URL}/health")
        response.raise_for_status()
        
        data = response.json()
        print(f"Status: {data['status']}")
        print(f"Providers: {', '.join(p['name'] for p in data.get('providers', []))}")
        print(f"Available models: {data.get('models', {}).get('total', 0)}")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Error checking health: {e}")
        return None


def using_ollama_python_client():
    """Example using the official Ollama Python client."""
    print("\n=== Using Ollama Python Client ===")
    
    try:
        import ollama
        
        # Configure client to use our bridge
        client = ollama.Client(host=OLLAMA_URL)
        
        # Generate completion
        print("Generating with Ollama client:")
        response = client.generate(
            model='gemini-flash',
            prompt='What is machine learning?',
            options={'temperature': 0.7}
        )
        print(f"Response: {response['response']}")
        
        # Chat completion
        print("\nChat with Ollama client:")
        chat_response = client.chat(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': 'Hello!'},
            ]
        )
        print(f"Response: {chat_response['message']['content']}")
        
    except ImportError:
        print("Ollama Python client not installed.")
        print("Install with: pip install ollama")
    except Exception as e:
        print(f"Error using Ollama client: {e}")


def main():
    """Run all examples."""
    print("Gemini-Ollama Bridge Examples\n")
    print(f"Connecting to: {OLLAMA_URL}\n")
    
    # Check if server is running
    health = health_check()
    if not health:
        print("Cannot connect to server. Please make sure the bridge is running.")
        print("Run: npm start")
        return
    
    # Run examples
    list_models()
    generate_completion(stream=False)
    generate_completion(stream=True)
    chat_completion(stream=False)
    generate_embeddings()
    using_ollama_python_client()
    
    print("\n=== All examples completed ===")


if __name__ == "__main__":
    main()
