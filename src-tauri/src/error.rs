use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("网络请求失败：{0}")]
    Http(String),
    #[error("QQ 接口返回错误：{0}")]
    Api(String),
    #[error("配置错误：{0}")]
    Config(String),
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 解析失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("URL 不合法：{0}")]
    Url(#[from] url::ParseError),
    #[error("WebSocket 错误：{0}")]
    Ws(String),
    #[error("{0}")]
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<reqwest::Error> for AppError {
    fn from(error: reqwest::Error) -> Self {
        if error.is_timeout() {
            AppError::Http("请求超时".into())
        } else if error.is_connect() {
            AppError::Http(format!("无法建立连接：{error}"))
        } else {
            AppError::Http(error.to_string())
        }
    }
}

impl From<tokio_tungstenite::tungstenite::Error> for AppError {
    fn from(error: tokio_tungstenite::tungstenite::Error) -> Self {
        AppError::Ws(error.to_string())
    }
}
