import json
import requests
import sys

# 获取命令行参数中的 name 值
if len(sys.argv) != 2:
    print("Usage: python pdbSearchID.py <name>")
    sys.exit(1)

name = sys.argv[1]

# 定义嵌入的 JSON 数据，并替换 name
query_data = {
    "query": {
        "type": "group",
        "logical_operator": "and",
        "nodes": [
            {
                "type": "terminal",
                "service": "text",
                "parameters": {
                    "operator": "exact_match",
                    "value": "X-RAY DIFFRACTION",
                    "attribute": "exptl.method"
                }
            },
            {
                "type": "terminal",
                "service": "text",
                "parameters": {
                    "operator": "less_or_equal",
                    "value": 2.5,
                    "attribute": "rcsb_entry_info.resolution_combined"
                }
            },
            {
                "type": "terminal",
                "service": "full_text",
                "parameters": {
                    "value": f"\"{name}\""
                }
            }
        ]
    },
    "request_options": {
        "paginate": {
            "start": 0,
            "rows": 1000
        }
    },
    "return_type": "entry"
}

# 将 JSON 数据转换为 URL 编码的查询字符串
query_string = json.dumps(query_data)

# 发送请求到 RCSB PDB API
url = f"https://search.rcsb.org/rcsbsearch/v2/query?json={query_string}"
response = requests.get(url)

# 检查响应状态并处理结果
if response.status_code == 200:
    search_results = response.json()
    ids = [entry['identifier'] for entry in search_results['result_set']]
    print(ids)
else:
    print(f"Error: {response.status_code}")
