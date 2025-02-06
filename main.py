from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
import os
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
from peft import PeftModel, LoraConfig, get_peft_model

app = FastAPI()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 1000

class ModelConfig:
    def __init__(self):
        # Get HF token from environment variable
        self.hf_token = ""
        if not self.hf_token:
            print("Warning: HF_TOKEN not set. Some models may not be accessible.")
            
        self.loaded_models = {}
        self.supported_models = {
            "dobby-8b": {
                "name": "SentientAGI/Dobby-Mini-Unhinged-Llama-3.1-8B",
                "handler": self.get_llama_response,
                "requires_auth": False
            },
            "llama3.1-8b": {
                "name": "meta-llama/Llama-3.1-8B-Instruct",
                "handler": self.get_llama_response,
                "requires_auth": True
            },
            # Add more models here
        }
        self.model_config = {
            "low_cpu_mem_usage": True,
            "torch_dtype": torch.float16,
            "device_map": "auto",
        }

    def format_chat_prompt(self, messages: List[ChatMessage]) -> str:
        """Format chat messages into a prompt string"""
        formatted_prompt = ""
        for msg in messages:
            if msg.role == "system":
                formatted_prompt += f"System: {msg.content}\n"
            elif msg.role == "user":
                formatted_prompt += f"User: {msg.content}\n"
            elif msg.role == "assistant":
                formatted_prompt += f"Assistant: {msg.content}\n"
        formatted_prompt += "Assistant: "
        return formatted_prompt

    async def get_llama_response(self, model_key: str, messages: List[ChatMessage], temperature: float, max_tokens: int) -> str:
        try:
            if model_key not in self.supported_models:
                raise ValueError(f"Model {model_key} not supported")
                
            model_info = self.supported_models[model_key]
            model_name = model_info["name"]
            requires_auth = model_info["requires_auth"]
            
            # Check if authentication is required but token is missing
            if requires_auth and not self.hf_token:
                raise ValueError(f"Model {model_key} requires HuggingFace authentication. Please set HF_TOKEN environment variable.")
            
            # Load model and tokenizer if not already loaded
            if model_name not in self.loaded_models:
                print(f"Loading model {model_name} for the first time...")
                
                # Common kwargs for both tokenizer and model
                auth_kwargs = {"token": self.hf_token} if requires_auth else {}
                
                # Load tokenizer with caching
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    use_fast=True,
                    cache_dir="./model_cache",
                    **auth_kwargs
                )
                
                # Load model with optimizations
                model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    cache_dir="./model_cache",
                    **self.model_config,
                    **auth_kwargs
                )
                
                if torch.cuda.is_available():
                    model = model.cuda()
                    if hasattr(torch, 'compile'):
                        model = torch.compile(model)
                
                self.loaded_models[model_name] = (model, tokenizer)
                print("Model loaded successfully!")
            else:
                model, tokenizer = self.loaded_models[model_name]
            
            # Format the prompt
            prompt = self.format_chat_prompt(messages)
            
            # Tokenize input
            inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
            
            # Generate response
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    do_sample=True,
                    pad_token_id=tokenizer.eos_token_id,
                    repetition_penalty=1.2,  # Add repetition penalty
                    no_repeat_ngram_size=3,  # Prevent repetition of 3-grams
                    early_stopping=True,     # Stop when EOS token is generated
                )
            
            # Decode and return the response
            full_response = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract only the assistant's response after the last prompt
            response_parts = full_response.split("Assistant: ")
            response = response_parts[-1].strip()
            
            # Clean up any remaining artifacts
            if "User:" in response:
                response = response.split("User:")[0].strip()
            
            return response
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error in Llama inference: {str(e)}")

    async def load_lora_model(self, base_model_name: str, lora_weights: str):
        """Load a model with LoRA weights"""
        try:
            # Load base model and tokenizer
            base_model = AutoModelForCausalLM.from_pretrained(
                base_model_name,
                torch_dtype=torch.float16,
                device_map="auto"
            )
            tokenizer = AutoTokenizer.from_pretrained(base_model_name)
            
            # Configure LoRA
            lora_config = LoraConfig(
                r=16,
                lora_alpha=32,
                target_modules=["q_proj", "v_proj"],
                lora_dropout=0.05,
                bias="none",
                task_type="CAUSAL_LM"
            )
            
            # Load LoRA weights
            model = get_peft_model(base_model, lora_config)
            model.load_adapter(lora_weights)
            
            # Store the model and tokenizer
            self.loaded_models[f"{base_model_name}_lora"] = (model, tokenizer)
            
            return {"message": "LoRA model loaded successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading LoRA model: {str(e)}")

model_config = ModelConfig()

@app.post("/chat")
async def chat(request: ChatRequest):
    if request.model not in model_config.supported_models:
        raise HTTPException(status_code=400, detail=f"Model {request.model} not supported")
    
    try:
        response = await model_config.supported_models[request.model]["handler"](
            request.model,
            request.messages,
            request.temperature,
            request.max_tokens
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load_lora")
async def load_lora_model(base_model: str, lora_weights: str):
    try:
        result = await model_config.load_lora_model(base_model, lora_weights)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models():
    return {
        "available_models": list(model_config.supported_models.keys())
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
