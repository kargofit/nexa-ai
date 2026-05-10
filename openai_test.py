from openai import OpenAI

client = OpenAI(api_key="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")

models = client.models.list()

print(models)
