import json
import logging
import os
import requests
import time
from typing import Dict, List, Any, Optional, Union

import lark_oapi as lark
from lark_oapi.api.bitable.v1 import *


class FeishuBitableClient:
    """
    飞书多维表格操作工具类
    
    封装了对飞书多维表格的增删改查操作
    无需手动获取和刷新应用访问凭证，SDK会自动管理
    """
    
    def __init__(self, app_id: str, app_secret: str, log_level: int = logging.INFO):
        """
        初始化飞书多维表格客户端
        
        Args:
            app_id: 飞书应用的 App ID
            app_secret: 飞书应用的 App Secret
            log_level: 日志等级，默认为 INFO
        """
        # 直接指定DEBUG级别而不是通过枚举
        self.client = lark.Client.builder() \
            .app_id(app_id) \
            .app_secret(app_secret) \
            .log_level(lark.LogLevel.DEBUG) \
            .build()
        
        self.logger = logging.getLogger("FeishuBitableClient")
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(log_level)
        
        # 存储应用凭证
        self.app_id = app_id
        self.app_secret = app_secret
    
    def search_records(self, 
                      app_token: str, 
                      table_id: str, 
                      view_id: Optional[str] = None,
                      field_names: Optional[List[str]] = None,
                      filter_: Optional[str] = None,
                      sort: Optional[str] = None,
                      page_size: int = 20,
                      page_token: Optional[str] = None,
                      user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        搜索多维表格记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            view_id: 视图 ID
            field_names: 需要返回的字段名列表
            filter_: 过滤条件
            sort: 排序条件
            page_size: 分页大小
            page_token: 分页标记
            user_id_type: 用户 ID 类型
            
        Returns:
            搜索结果数据
        """
        request_body = SearchAppTableRecordRequestBody.builder()
        
        if view_id:
            request_body.view_id(view_id)
        if field_names:
            request_body.field_names(field_names)
        if filter_:
            request_body.filter(filter_)
        if sort:
            request_body.sort(sort)
            
        request = SearchAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .page_size(page_size) \
            .request_body(request_body.build()) \
            .build()
            
        if page_token:
            request.page_token(page_token)
            
        response: SearchAppTableRecordResponse = self.client.bitable.v1.app_table_record.search(request)
        
        if not response.success():
            error_msg = f"搜索记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {}
        if response.data:
            result = {
                "has_more": response.data.has_more,
                "page_token": response.data.page_token,
                "total": response.data.total,
                "items": []
            }
            if response.data.items:
                for item in response.data.items:
                    record_dict = {
                        "record_id": item.record_id,
                        "fields": item.fields
                    }
                    result["items"].append(record_dict)
            
        return result
    
    def get_all_records(self, 
                       app_token: str, 
                       table_id: str, 
                       view_id: Optional[str] = None,
                       field_names: Optional[List[str]] = None,
                       filter_: Optional[str] = None,
                       sort: Optional[str] = None,
                       user_id_type: str = "open_id") -> List[Dict[str, Any]]:
        """
        获取多维表格的所有记录，自动处理分页
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            view_id: 视图 ID
            field_names: 需要返回的字段名列表
            filter_: 过滤条件
            sort: 排序条件
            user_id_type: 用户 ID 类型
            
        Returns:
            所有记录的列表
        """
        all_records = []
        page_token = None
        has_more = True
        
        while has_more:
            result = self.search_records(
                app_token=app_token,
                table_id=table_id,
                view_id=view_id,
                field_names=field_names,
                filter_=filter_,
                sort=sort,
                page_token=page_token,
                page_size=100  # 设置较大的页大小以减少请求次数
            )
            
            if "items" in result:
                all_records.extend(result["items"])
                
            has_more = result.get("has_more", False)
            page_token = result.get("page_token")
            
        return all_records
    
    def get_record(self, 
                  app_token: str, 
                  table_id: str, 
                  record_id: str,
                  user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        获取单条记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            record_id: 记录 ID
            user_id_type: 用户 ID 类型
            
        Returns:
            记录数据
        """
        request = GetAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .record_id(record_id) \
            .build()
            
        response: GetAppTableRecordResponse = self.client.bitable.v1.app_table_record.get(request)
        
        if not response.success():
            error_msg = f"获取记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {}
        if response.data and response.data.record:
            result = {
                "record_id": response.data.record.record_id,
                "fields": response.data.record.fields
            }
            
        return result
    
    def create_record(self, 
                     app_token: str, 
                     table_id: str, 
                     fields: Dict[str, Any],
                     user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        创建记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            fields: 字段值，格式为 {字段名: 字段值}
            user_id_type: 用户 ID 类型
            
        Returns:
            创建的记录数据
        """
        # 使用正确的类名
        body = {
            "fields": fields
        }
            
        request = CreateAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .request_body(body) \
            .build()
            
        response: CreateAppTableRecordResponse = self.client.bitable.v1.app_table_record.create(request)
        
        if not response.success():
            error_msg = f"创建记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {}
        if response.data and response.data.record:
            result = {
                "record": {
                    "record_id": response.data.record.record_id,
                    "fields": response.data.record.fields
                }
            }
            
        return result
    
    def batch_create_records(self, 
                           app_token: str, 
                           table_id: str, 
                           records: List[Dict[str, Any]],
                           user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        批量创建记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            records: 记录列表，每个记录为 {字段名: 字段值} 的字典
            user_id_type: 用户 ID 类型
            
        Returns:
            创建的记录数据
        """
        # 直接构建请求体
        records_to_create = []
        for record in records:
            records_to_create.append({"fields": record})
            
        body = {
            "records": records_to_create
        }
            
        request = BatchCreateAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .request_body(body) \
            .build()
            
        response: BatchCreateAppTableRecordResponse = self.client.bitable.v1.app_table_record.batch_create(request)
        
        if not response.success():
            error_msg = f"批量创建记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {"records": []}
        if response.data and response.data.records:
            for record in response.data.records:
                result["records"].append({
                    "record_id": record.record_id,
                    "fields": record.fields
                })
            
        return result
    
    def update_record(self, 
                     app_token: str, 
                     table_id: str, 
                     record_id: str,
                     fields: Dict[str, Any],
                     user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        更新记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            record_id: 记录 ID
            fields: 需要更新的字段，格式为 {字段名: 字段值}
            user_id_type: 用户 ID 类型
            
        Returns:
            更新后的记录数据
        """
        # 直接构建请求体
        body = {
            "fields": fields
        }
            
        request = UpdateAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .record_id(record_id) \
            .request_body(body) \
            .build()
            
        response: UpdateAppTableRecordResponse = self.client.bitable.v1.app_table_record.update(request)
        
        if not response.success():
            error_msg = f"更新记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {}
        if response.data and response.data.record:
            result = {
                "record": {
                    "record_id": response.data.record.record_id,
                    "fields": response.data.record.fields
                }
            }
            
        return result
    
    def batch_update_records(self, 
                           app_token: str, 
                           table_id: str, 
                           records: List[Dict[str, Any]],
                           user_id_type: str = "open_id") -> Dict[str, Any]:
        """
        批量更新记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            records: 记录列表，每个记录必须包含 record_id 和 fields 字段
            user_id_type: 用户 ID 类型
            
        Returns:
            更新后的记录数据
        """
        records_to_update = []
        for record in records:
            if "record_id" not in record or "fields" not in record:
                raise ValueError("每条记录必须包含 record_id 和 fields 字段")
                
            records_to_update.append({
                "record_id": record["record_id"],
                "fields": record["fields"]
            })
            
        body = {
            "records": records_to_update
        }
            
        request = BatchUpdateAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .request_body(body) \
            .build()
            
        response: BatchUpdateAppTableRecordResponse = self.client.bitable.v1.app_table_record.batch_update(request)
        
        if not response.success():
            error_msg = f"批量更新记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {"records": []}
        if response.data and response.data.records:
            for record in response.data.records:
                result["records"].append({
                    "record_id": record.record_id,
                    "fields": record.fields
                })
            
        return result
    
    def delete_record(self, 
                     app_token: str, 
                     table_id: str, 
                     record_id: str,
                     user_id_type: str = "open_id") -> bool:
        """
        删除记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            record_id: 记录 ID
            user_id_type: 用户 ID 类型
            
        Returns:
            是否删除成功
        """
        request = DeleteAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .record_id(record_id) \
            .build()
            
        response: DeleteAppTableRecordResponse = self.client.bitable.v1.app_table_record.delete(request)
        
        if not response.success():
            error_msg = f"删除记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        return True
    
    def batch_delete_records(self, 
                           app_token: str, 
                           table_id: str, 
                           record_ids: List[str],
                           user_id_type: str = "open_id") -> bool:
        """
        批量删除记录
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            record_ids: 记录 ID 列表
            user_id_type: 用户 ID 类型
            
        Returns:
            是否删除成功
        """
        # 直接构建请求体
        body = {
            "records": record_ids
        }
            
        request = BatchDeleteAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .request_body(body) \
            .build()
            
        response: BatchDeleteAppTableRecordResponse = self.client.bitable.v1.app_table_record.batch_delete(request)
        
        if not response.success():
            error_msg = f"批量删除记录失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        return True
    
    def get_table_list(self, 
                      app_token: str,
                      page_size: int = 100,
                      page_token: Optional[str] = None) -> Dict[str, Any]:
        """
        获取数据表列表
        
        Args:
            app_token: 多维表格的 app_token
            page_size: 分页大小
            page_token: 分页标记
            
        Returns:
            数据表列表
        """
        request = ListAppTableRequest.builder() \
            .app_token(app_token) \
            .page_size(page_size) \
            .build()
            
        if page_token:
            request.page_token(page_token)
            
        response: ListAppTableResponse = self.client.bitable.v1.app_table.list(request)
        
        if not response.success():
            error_msg = f"获取数据表列表失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {
            "has_more": False,
            "page_token": "",
            "items": []
        }
        
        if response.data:
            result["has_more"] = response.data.has_more
            result["page_token"] = response.data.page_token
            
            if response.data.items:
                for item in response.data.items:
                    table_dict = {
                        "table_id": item.table_id,
                        "name": item.name,
                        "revision": item.revision
                    }
                    result["items"].append(table_dict)
                    
        return result
    
    def get_all_tables(self, 
                     app_token: str) -> List[Dict[str, Any]]:
        """
        获取所有数据表，自动处理分页
        
        Args:
            app_token: 多维表格的 app_token
            
        Returns:
            所有数据表的列表
        """
        all_tables = []
        page_token = None
        has_more = True
        
        while has_more:
            result = self.get_table_list(
                app_token=app_token,
                page_token=page_token
            )
            
            if "items" in result:
                all_tables.extend(result["items"])
                
            has_more = result.get("has_more", False)
            page_token = result.get("page_token")
            
        return all_tables
    
    def get_field_list(self, 
                     app_token: str,
                     table_id: str,
                     view_id: Optional[str] = None,
                     page_size: int = 100,
                     page_token: Optional[str] = None) -> Dict[str, Any]:
        """
        获取字段列表
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            view_id: 视图 ID
            page_size: 分页大小
            page_token: 分页标记
            
        Returns:
            字段列表
        """
        request = ListAppTableFieldRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .page_size(page_size) \
            .build()
            
        if view_id:
            request.view_id(view_id)
        if page_token:
            request.page_token(page_token)
            
        response: ListAppTableFieldResponse = self.client.bitable.v1.app_table_field.list(request)
        
        if not response.success():
            error_msg = f"获取字段列表失败，code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
            self.logger.error(error_msg)
            self.logger.error(json.dumps(json.loads(response.raw.content), indent=4, ensure_ascii=False))
            raise Exception(error_msg)
            
        # 手动转换响应数据为字典格式
        result = {
            "has_more": False,
            "page_token": "",
            "items": []
        }
        
        if response.data:
            result["has_more"] = response.data.has_more
            result["page_token"] = response.data.page_token
            
            if response.data.items:
                for item in response.data.items:
                    field_dict = {
                        "field_id": item.field_id,
                        "field_name": item.field_name,
                        "type": item.type
                    }
                    result["items"].append(field_dict)
                    
        return result
    
    def get_all_fields(self, 
                     app_token: str,
                     table_id: str,
                     view_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        获取所有字段，自动处理分页
        
        Args:
            app_token: 多维表格的 app_token
            table_id: 表格 ID
            view_id: 视图 ID
            
        Returns:
            所有字段的列表
        """
        all_fields = []
        page_token = None
        has_more = True
        
        while has_more:
            result = self.get_field_list(
                app_token=app_token,
                table_id=table_id,
                view_id=view_id,
                page_token=page_token
            )
            
            if "items" in result:
                all_fields.extend(result["items"])
                
            has_more = result.get("has_more", False)
            page_token = result.get("page_token")
            
        return all_fields

    def get_tenant_access_token(self) -> str:
        """
        获取飞书的tenant_access_token
        
        使用应用的app_id和app_secret获取tenant_access_token，
        用于调用需要授权的API，如文件下载
        
        Returns:
            tenant_access_token: 租户访问令牌
        """
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        
        payload = {
            "app_id": self.app_id,
            "app_secret": self.app_secret
        }
        
        headers = {
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    return data.get("tenant_access_token", "")
                else:
                    self.logger.error(f"获取tenant_access_token失败: {data}")
            else:
                self.logger.error(f"获取tenant_access_token请求失败，状态码: {response.status_code}")
        except Exception as e:
            self.logger.error(f"获取tenant_access_token异常: {e}")
        
        return ""
    
    def download_attachment(self, attachment_item: Dict[str, Any], save_path: str) -> bool:
        """
        下载飞书附件
        
        从飞书多维表格的附件字段中下载文件。
        注意：必须使用API返回的原始URL（带有必要的extra参数），而不是自己构建URL
        
        Args:
            attachment_item: 附件字段项，必须包含url和name字段
            save_path: 保存文件的路径
            
        Returns:
            bool: 下载是否成功
        """
        if not attachment_item:
            self.logger.error("附件项为空，无法下载")
            return False
        
        # 获取文件URL和名称
        file_url = attachment_item.get('url')
        file_name = attachment_item.get('name', 'unknown_file')
        
        if not file_url:
            self.logger.error(f"附件项缺少URL信息: {attachment_item}")
            return False
        
        try:
            # 获取tenant_access_token用于授权
            token = self.get_tenant_access_token()
            if not token:
                self.logger.error(f"无法获取授权token，下载失败: {file_url}")
                return False
                
            headers = {
                "Authorization": f"Bearer {token}"
            }
            
            self.logger.info(f"开始下载文件: {file_name}")
            self.logger.debug(f"下载URL: {file_url}")
            
            response = requests.get(file_url, headers=headers, stream=True)
            
            if response.status_code != 200:
                self.logger.error(f"下载文件失败，状态码: {response.status_code}, 响应: {response.text}")
                return False
                
            # 确保目标文件夹存在
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            # 保存文件
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            # 检查文件大小
            file_size = os.path.getsize(save_path)
            if file_size < 100:  # 如果文件太小，可能是下载失败
                self.logger.warning(f"下载文件可能失败，文件大小过小: {file_size} bytes")
                return False
                
            self.logger.info(f"文件下载成功: {save_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"下载文件异常: {e}")
            return False
    
    def download_field_attachments(self, field_data: List[Dict], save_dir: str, prefix: str = "") -> List[str]:
        """
        下载字段中的所有附件
        
        Args:
            field_data: 字段数据，一个附件项列表
            save_dir: 保存文件的目录
            prefix: 文件名前缀
            
        Returns:
            List[str]: 下载成功的文件路径列表
        """
        downloaded_files = []
        
        # 如果字段数据为空，直接返回
        if not field_data or not isinstance(field_data, list):
            self.logger.warning(f"字段数据为空或不是列表类型: {type(field_data).__name__}")
            return downloaded_files
        
        self.logger.info(f"处理附件字段，包含 {len(field_data)} 个文件")
        
        # 遍历附件列表
        for i, item in enumerate(field_data):
            if not isinstance(item, dict):
                continue
                
            # 获取文件名
            file_name = item.get('name', f"file_{i+1}")
            
            # 生成保存路径
            if prefix:
                file_name = f"{prefix}_{i+1}_{file_name}"
            else:
                file_name = f"attachment_{i+1}_{file_name}"
                
            save_path = os.path.join(save_dir, file_name)
            
            # 下载文件
            if self.download_attachment(item, save_path):
                downloaded_files.append(save_path)
                # 成功下载一个后短暂暂停，避免请求频率过高
                time.sleep(0.5)
        
        return downloaded_files


# 使用示例
def example_usage():
    """使用示例"""
    # 创建客户端
    client = FeishuBitableClient(
        app_id="YOUR_APP_ID", 
        app_secret="YOUR_APP_SECRET"
    )
    
    # 获取所有记录示例
    app_token = "YOUR_APP_TOKEN"
    table_id = "YOUR_TABLE_ID"
    records = client.get_all_records(app_token, table_id)
    print(f"获取到 {len(records)} 条记录")
    
    # 创建记录示例
    new_record = client.create_record(
        app_token, 
        table_id, 
        {"标题": "测试记录", "内容": "这是一条测试记录"}
    )
    print(f"创建的新记录: {new_record}")
    
    # 更新记录示例
    record_id = new_record["record"]["record_id"]
    updated_record = client.update_record(
        app_token, 
        table_id, 
        record_id, 
        {"标题": "已更新的记录", "内容": "这条记录已经被更新"}
    )
    print(f"更新后的记录: {updated_record}")
    
    # 删除记录示例
    client.delete_record(app_token, table_id, record_id)
    print(f"记录 {record_id} 已删除")
    
    # 下载附件示例
    record_with_attachments = client.get_record(app_token, table_id, "RECORD_ID_WITH_ATTACHMENTS")
    if "成品" in record_with_attachments.get("fields", {}):
        attachments = record_with_attachments["fields"]["成品"]
        os.makedirs("downloads", exist_ok=True)
        downloaded_files = client.download_field_attachments(attachments, "downloads", "成品文件")
        print(f"成功下载了 {len(downloaded_files)} 个附件文件")


if __name__ == "__main__":
    # 实际使用示例
    # example_usage()
    pass 